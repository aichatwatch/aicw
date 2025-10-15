import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/compact-logger.js';
import { waitForEnterInInteractiveMode } from '../utils/misc-utils.js';
import { QUESTIONS_DIR, QUESTION_DATA_COMPILED_DATE_DIR } from '../config/paths.js';
import { MAIN_SECTIONS } from '../config/entities.js';
import { PipelineCriticalError, createMissingFileError } from '../utils/pipeline-errors.js';
import { loadDataJs, saveDataJs, readQuestions } from '../utils/project-utils.js';
import { getProjectNameFromCommandLine, validateAndLoadProject, getTargetDateFromProjectOrEnvironment } from '../utils/project-utils.js';
import { getModuleNameFromUrl } from '../utils/misc-utils.js';

const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

// ============================================================================
// DISTANCE CONSTRAINTS
// ============================================================================

// Maximum sentences between entity mention and source link
const SOURCE_DETECTION_MAX_SENTENCES_FROM_SOURCE = 2;

// Maximum words between entity mention and source link
const SOURCE_DETECTION_MAX_WORDS_FROM_SOURCE = 250;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Entity source with bots tracking
 */
export interface EntitySource {
  url: string;      // Cleaned URL (no protocol, www, query params, anchors)
  bots: string;    // Model ID like "openai_chatgpt_with_search_latest"
}

/**
 * Answer file information with path and bots
 */
interface AnswerFileInfo {
  path: string;
  bots: string;
}

// ============================================================================
// URL CLEANING & DEDUPLICATION
// ============================================================================

/**
 * Clean and normalize URL for storage
 * Removes: protocol (http/https), www., query params, anchors, trailing slash
 */
function cleanUrl(url: string): string {
  let cleaned = url.trim();

  // Remove protocol
  cleaned = cleaned.replace(/^https?:\/\//, '');

  // Remove www.
  cleaned = cleaned.replace(/^www\./, '');

  // Remove query params
  cleaned = cleaned.split('?')[0];

  // Remove anchors
  cleaned = cleaned.split('#')[0];

  // Remove markdown artifacts from end: ), *, ., etc.
  cleaned = cleaned.replace(/[\)\*\.\,]+$/, '');

  // Remove trailing slash
  cleaned = cleaned.replace(/\/$/, '');

  return cleaned.toLowerCase();
}

/**
 * Deduplicate sources and aggregate bot IDs
 * Groups by URL and combines all bot IDs as comma-separated string
 */
function deduplicateSources(sources: EntitySource[]): EntitySource[] {
  const urlMap = new Map<string, Set<string>>();

  for (const source of sources) {
    const cleanedUrl = cleanUrl(source.url);
    if (!urlMap.has(cleanedUrl)) {
      urlMap.set(cleanedUrl, new Set<string>());
    }
    urlMap.get(cleanedUrl)!.add(source.bots);
  }

  const result: EntitySource[] = [];
  for (const [url, botsSet] of urlMap.entries()) {
    result.push({
      url,
      bots: Array.from(botsSet).sort().join(',')
    });
  }

  return result;
}

/**
 * Distance check result with details
 */
interface DistanceCheckResult {
  withinLimits: boolean;
  minSentences: number;
  minWords: number;
}

/**
 * Check if a link found in context is within distance limits from entity mention
 * Measures minimum distance in both sentences and words
 * Returns detailed result with actual distances measured
 */
function isLinkWithinDistanceLimits(
  contextText: string,
  entityValue: string,
  linkOrMarker: string
): DistanceCheckResult {
  const normalizedContext = contextText.toLowerCase();
  const normalizedEntity = entityValue.toLowerCase();

  // Find all entity mention positions
  const entityPositions: number[] = [];
  let pos = 0;
  while ((pos = normalizedContext.indexOf(normalizedEntity, pos)) !== -1) {
    entityPositions.push(pos);
    pos += normalizedEntity.length;
  }

  if (entityPositions.length === 0) {
    return { withinLimits: false, minSentences: Infinity, minWords: Infinity };
  }

  // Find link/marker position
  const linkPos = contextText.indexOf(linkOrMarker);
  if (linkPos === -1) {
    return { withinLimits: false, minSentences: Infinity, minWords: Infinity };
  }

  // Calculate minimum distance to any entity mention
  let minWords = Infinity;
  let minSentences = Infinity;

  for (const entityPos of entityPositions) {
    const start = Math.min(entityPos, linkPos);
    const end = Math.max(entityPos, linkPos);
    const textBetween = contextText.substring(start, end);

    // Count words
    const wordCount = textBetween.split(/\s+/).filter(w => w.length > 0).length;

    // Count sentences
    const sentenceCount = (textBetween.match(/[.!?]+/g) || []).length;

    minWords = Math.min(minWords, wordCount);
    minSentences = Math.min(minSentences, sentenceCount);
  }

  // Check both constraints (AND)
  const withinLimits = (
    minSentences <= SOURCE_DETECTION_MAX_SENTENCES_FROM_SOURCE &&
    minWords <= SOURCE_DETECTION_MAX_WORDS_FROM_SOURCE
  );

  return { withinLimits, minSentences, minWords };
}

// ============================================================================
// SENTENCE SPLITTING
// ============================================================================

/**
 * Split text into sentences with smart boundary detection
 * Handles: "Mr. Smith", "Dr. Jones", "U.S.", "U.K."
 */
function splitIntoSentences(text: string): string[] {
  // Handle common abbreviations by temporarily replacing dots
  let processed = text
    .replace(/Mr\./g, 'Mr[DOT]')
    .replace(/Mrs\./g, 'Mrs[DOT]')
    .replace(/Ms\./g, 'Ms[DOT]')
    .replace(/Dr\./g, 'Dr[DOT]')
    .replace(/Prof\./g, 'Prof[DOT]')
    .replace(/U\.S\./g, 'US')
    .replace(/U\.K\./g, 'UK')
    .replace(/e\.g\./g, 'eg')
    .replace(/i\.e\./g, 'ie');

  // Split on sentence boundaries: . ! ? followed by space and capital or end
  const sentences = processed.split(/([.!?])\s+(?=[A-Z])|([.!?])$/);

  // Reconstruct sentences with their punctuation
  const result: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    if (!sentences[i]) continue;

    let sentence = sentences[i];

    // Add punctuation back if next element is punctuation
    if (i + 1 < sentences.length && /^[.!?]$/.test(sentences[i + 1])) {
      sentence += sentences[i + 1];
      i++; // Skip the punctuation element
    }

    // Restore abbreviations
    sentence = sentence
      .replace(/\[DOT\]/g, '.');

    if (sentence.trim().length > 0) {
      result.push(sentence.trim());
    }
  }

  // Fallback: if no sentences found, return the original text as one sentence
  if (result.length === 0 && text.trim().length > 0) {
    return [text.trim()];
  }

  return result;
}

// ============================================================================
// LINK EXTRACTION FUNCTIONS (4 Types)
// ============================================================================

/**
 * Type 1: Extract markdown links [text](url)
 */
function extractMarkdownLinks(text: string): string[] {
  const links: string[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const url = match[2].trim();
    if (url && !url.startsWith('#')) { // Skip anchor links
      links.push(url);
    }
  }

  return links;
}

/**
 * Type 2: Extract plain URLs with protocol (http:// or https://)
 */
function extractPlainUrls(text: string): string[] {
  const links: string[] = [];
  const regex = /https?:\/\/[^\s<>"{}|\\^`\[\]()]+/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    links.push(match[0]);
  }

  return links;
}

/**
 * Type 3: Extract plain domains (www.example.com or example.com)
 */
function extractPlainDomains(text: string): string[] {
  const domains: string[] = [];

  // Match domain patterns but exclude if preceded by protocol
  // Handles: www.example.com, example.com, example.com/path
  const regex = /(?<!https?:\/\/)(?<!https?:\/\/www\.)(?:www\.)?([a-z0-9][-a-z0-9]*\.)+[a-z]{2,}(?:\/[^\s)]*)?/gi;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const domain = match[0];

    // Filter out common false positives
    if (!domain.endsWith('.md') &&
        !domain.endsWith('.js') &&
        !domain.endsWith('.ts') &&
        !domain.endsWith('.json')) {
      domains.push(domain);
    }
  }

  return domains;
}

/**
 * Type 4: Resolve citation references [1], [8], [9] to citations array
 * Example: "text[1][8][9]" → citations[0], citations[7], citations[8]
 */
function resolveCitationReferences(context: string, citations: string[]): string[] {
  const sources: string[] = [];

  // Match [1], [8], [9], etc.
  const regex = /\[(\d+)\]/g;

  let match;
  while ((match = regex.exec(context)) !== null) {
    const citationNumber = parseInt(match[1], 10);
    const citationIndex = citationNumber - 1; // Convert to 0-based array index

    // Verify index is valid and citation exists
    if (citationIndex >= 0 && citationIndex < citations.length) {
      const citation = citations[citationIndex];
      if (citation) {
        sources.push(citation);
      }
    }
  }

  return sources;
}

// ============================================================================
// CONTEXT WINDOW EXTRACTION
// ============================================================================

/**
 * Extract context windows (±sentenceRadius sentences) around entity mentions
 */
function extractContextWindowsForEntity(
  content: string,
  entityValue: string,
  sentenceRadius: number = 2
): string[] {
  const contexts: string[] = [];

  // Split into sentences
  const sentences = splitIntoSentences(content);

  if (sentences.length === 0) {
    return [content]; // Fallback to entire content
  }

  // Find all sentences containing entity (case-insensitive)
  const matchingIndices: number[] = [];
  const normalizedEntity = entityValue.toLowerCase();

  sentences.forEach((sentence, index) => {
    if (sentence.toLowerCase().includes(normalizedEntity)) {
      matchingIndices.push(index);
    }
  });

  // If no matches found, return empty
  if (matchingIndices.length === 0) {
    return [];
  }

  // For each match, extract ±sentenceRadius context
  const extractedRanges = new Set<string>();

  for (const matchIndex of matchingIndices) {
    const startIdx = Math.max(0, matchIndex - sentenceRadius);
    const endIdx = Math.min(sentences.length - 1, matchIndex + sentenceRadius);

    const contextSentences = sentences.slice(startIdx, endIdx + 1);
    const contextText = contextSentences.join(' ');

    // Use range as key to avoid duplicate contexts
    const rangeKey = `${startIdx}-${endIdx}`;
    if (!extractedRanges.has(rangeKey)) {
      extractedRanges.add(rangeKey);
      contexts.push(contextText);
    }
  }

  return contexts;
}

// ============================================================================
// STRATEGY 1: CONTENT PROXIMITY SEARCH
// ============================================================================

/**
 * Find all links near entity mentions in content (±2 sentences)
 * Supports 4 link types: markdown, plain URLs, plain domains, citation references
 */
function findLinksNearEntityInContent(
  content: string,
  entityValue: string,
  citations: string[]
): string[] {
  const sources: string[] = [];

  // Extract context windows around entity mentions
  const contexts = extractContextWindowsForEntity(content, entityValue, 2);

  if (contexts.length === 0) {
    return sources;
  }

  // Extract all 4 link types from each context and filter by distance
  for (const context of contexts) {
    // Type 1: Markdown links
    const markdownLinks = extractMarkdownLinks(context);
    for (const link of markdownLinks) {
      const distanceCheck = isLinkWithinDistanceLimits(context, entityValue, link);
      if (distanceCheck.withinLimits) {
        sources.push(link);
      } else {
        logger.warn(
          `Skipped source "${link}" for entity "${entityValue}" - ` +
          `distance: ${distanceCheck.minSentences} sentences, ${distanceCheck.minWords} words ` +
          `(limits: ${SOURCE_DETECTION_MAX_SENTENCES_FROM_SOURCE} sentences, ${SOURCE_DETECTION_MAX_WORDS_FROM_SOURCE} words)`
        );
      }
    }

    // Type 2: Plain URLs
    const plainUrls = extractPlainUrls(context);
    for (const link of plainUrls) {
      const distanceCheck = isLinkWithinDistanceLimits(context, entityValue, link);
      if (distanceCheck.withinLimits) {
        sources.push(link);
      } else {
        logger.warn(
          `Skipped source "${link}" for entity "${entityValue}" - ` +
          `distance: ${distanceCheck.minSentences} sentences, ${distanceCheck.minWords} words ` +
          `(limits: ${SOURCE_DETECTION_MAX_SENTENCES_FROM_SOURCE} sentences, ${SOURCE_DETECTION_MAX_WORDS_FROM_SOURCE} words)`
        );
      }
    }

    // Type 3: Plain domains
    const plainDomains = extractPlainDomains(context);
    for (const link of plainDomains) {
      const distanceCheck = isLinkWithinDistanceLimits(context, entityValue, link);
      if (distanceCheck.withinLimits) {
        sources.push(link);
      } else {
        logger.warn(
          `Skipped source "${link}" for entity "${entityValue}" - ` +
          `distance: ${distanceCheck.minSentences} sentences, ${distanceCheck.minWords} words ` +
          `(limits: ${SOURCE_DETECTION_MAX_SENTENCES_FROM_SOURCE} sentences, ${SOURCE_DETECTION_MAX_WORDS_FROM_SOURCE} words)`
        );
      }
    }

    // Type 4: Citation references - check distance to marker [N], not resolved URL
    const citationRegex = /\[(\d+)\]/g;
    let match;
    while ((match = citationRegex.exec(context)) !== null) {
      const marker = match[0]; // e.g., "[1]"
      const citationNumber = parseInt(match[1], 10);
      const citationIndex = citationNumber - 1;

      if (citationIndex >= 0 && citationIndex < citations.length) {
        const citationUrl = citations[citationIndex];
        if (citationUrl) {
          const distanceCheck = isLinkWithinDistanceLimits(context, entityValue, marker);
          if (distanceCheck.withinLimits) {
            sources.push(citationUrl);
          } else {
            logger.warn(
              `Skipped citation ${marker} (${citationUrl}) for entity "${entityValue}" - ` +
              `distance: ${distanceCheck.minSentences} sentences, ${distanceCheck.minWords} words ` +
              `(limits: ${SOURCE_DETECTION_MAX_SENTENCES_FROM_SOURCE} sentences, ${SOURCE_DETECTION_MAX_WORDS_FROM_SOURCE} words)`
            );
          }
        }
      }
    }
  }

  return sources;
}

// ============================================================================
// STRATEGY 2: ANNOTATIONS SEARCH
// ============================================================================

/**
 * Find links in annotations where entity is mentioned
 * Checks: title, content, and url fields (with encoding variations)
 */
function findLinksInAnnotations(
  entityValue: string,
  annotations: any[]
): string[] {
  const sources: string[] = [];
  const normalizedEntity = entityValue.toLowerCase().trim();

  if (!annotations || !Array.isArray(annotations)) {
    return sources;
  }

  for (const annotation of annotations) {
    if (annotation.type !== 'url_citation') continue;

    const citation = annotation.url_citation;
    if (!citation || !citation.url) continue;

    let found = false;

    // Field 1: Check title
    if (citation.title && citation.title.toLowerCase().includes(normalizedEntity)) {
      sources.push(citation.url);
      found = true;
    }

    // Field 2: Check content (OpenAI provides this with snippets)
    if (!found && citation.content && citation.content.toLowerCase().includes(normalizedEntity)) {
      sources.push(citation.url);
      found = true;
    }

    // Field 3: Check URL (with encoding variations)
    if (!found) {
      const urlDecoded = decodeURIComponent(citation.url).toLowerCase();
      const urlVariations = [
        normalizedEntity,
        normalizedEntity.replace(/ /g, '-'),   // "Naval Ravikant" → "naval-ravikant"
        normalizedEntity.replace(/ /g, '_'),   // "Naval Ravikant" → "naval_ravikant"
        normalizedEntity.replace(/ /g, '%20')  // "Naval Ravikant" → "naval%20ravikant"
      ];

      for (const variation of urlVariations) {
        if (urlDecoded.includes(variation)) {
          sources.push(citation.url);
          break;
        }
      }
    }
  }

  return sources;
}

// ============================================================================
// STRATEGY 3: CITATIONS DIRECT SEARCH
// ============================================================================

/**
 * Find citations where entity name appears in URL
 */
function findLinksInCitations(
  entityValue: string,
  citations: string[]
): string[] {
  const sources: string[] = [];
  const normalizedEntity = entityValue.toLowerCase().trim();

  if (!citations || !Array.isArray(citations)) {
    return sources;
  }

  for (const citationUrl of citations) {
    if (!citationUrl) continue;

    const urlDecoded = decodeURIComponent(citationUrl).toLowerCase();

    // Check if entity name appears in URL
    const variations = [
      normalizedEntity,
      normalizedEntity.replace(/ /g, '-'),
      normalizedEntity.replace(/ /g, '_')
    ];

    for (const variation of variations) {
      if (urlDecoded.includes(variation)) {
        sources.push(citationUrl);
        break;
      }
    }
  }

  return sources;
}

// ============================================================================
// ANSWER FILE LOADING
// ============================================================================

/**
 * Load all answer.json files for a question and date
 * Returns array with file paths and extracted botss
 */
async function loadAnswerJsonFiles(
  project: string,
  questionFolder: string,
  targetDate: string
): Promise<AnswerFileInfo[]> {
  const answersDir = path.join(
    QUESTIONS_DIR(project),
    questionFolder,
    'answers',
    targetDate
  );

  const files: AnswerFileInfo[] = [];

  try {
    const modelDirs = await fs.readdir(answersDir, { withFileTypes: true });

    for (const modelDir of modelDirs) {
      if (!modelDir.isDirectory()) continue;

      const answerPath = path.join(answersDir, modelDir.name, 'answer.json');

      try {
        await fs.access(answerPath);
        files.push({
          path: answerPath,
          bots: modelDir.name  // Extract bots directly from directory name
        });
      } catch {
        // answer.json doesn't exist for this model
        logger.debug(`No answer.json found at ${answerPath}`);
        continue;
      }
    }
  } catch (error) {
    logger.debug(`Cannot read answers directory: ${answersDir}`);
  }

  return files;
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Main function to extract source links for all non-computed entities
 */
export async function enrichGetSourceLinksForEntities(
  project: string,
  targetDate: string
): Promise<void> {
  logger.info(`Extracting source links for entities in project: ${project} (date: ${targetDate})`);

  // Non-computed sections to process
  const NON_COMPUTED_SECTIONS = ['products', 'organizations', 'persons', 'keywords', 'places', 'events', 'links'];

  // Read all questions
  const questions = await readQuestions(project);

  logger.info(`Processing ${questions.length} questions`);
  logger.startProgress(questions.length, 'questions');

  let processedCount = 0;
  let totalEntitiesProcessed = 0;
  let totalSourcesFound = 0;

  for (const [index, question] of questions.entries()) {
    const currentIndex = index + 1;
    logger.updateProgress(currentIndex, `Processing ${question.folder}...`);

    // Path to compiled data file
    const compiledFile = path.join(
      QUESTION_DATA_COMPILED_DATE_DIR(project, question.folder, targetDate),
      `${targetDate}-data.js`
    );

    // Check if compiled file exists
    try {
      await fs.access(compiledFile);
    } catch {
      throw createMissingFileError(question.folder, compiledFile, CURRENT_MODULE_NAME);
    }

    try {
      // Load compiled data
      const { data, dataKey } = await loadDataJs(compiledFile);

      // Load all answer.json files for this question
      const answerFiles = await loadAnswerJsonFiles(project, question.folder, targetDate);

      if (answerFiles.length === 0) {
        logger.warn(`No answer.json files found for ${question.folder}`);
        continue;
      }

      logger.debug(`  Found ${answerFiles.length} answer files for ${question.folder}`);

      // Process each non-computed section
      for (const sectionName of NON_COMPUTED_SECTIONS) {
        if (!data[sectionName] || !Array.isArray(data[sectionName])) {
          continue;
        }

        // Process each item in section
        for (const item of data[sectionName]) {
          if (!item.value) continue;

          const allSources: EntitySource[] = [];

          // Process each answer file
          for (const answerFile of answerFiles) {
            try {
              const answerContent = await fs.readFile(answerFile.path, 'utf-8');
              const answer = JSON.parse(answerContent);

              const choice = answer.choices?.[0];
              if (!choice) continue;

              const content = choice.message?.content || '';
              const annotations = choice.message?.annotations || [];
              const citations = answer.citations || [];

              // Strategy 1: Content proximity (4 link types)
              const contentLinks = findLinksNearEntityInContent(content, item.value, citations);
              for (const url of contentLinks) {
                allSources.push({ url, bots: answerFile.bots });
              }

              // Strategy 2: Annotations (title + content + url)
              const annotationLinks = findLinksInAnnotations(item.value, annotations);
              for (const url of annotationLinks) {
                allSources.push({ url, bots: answerFile.bots });
              }

              // Strategy 3: Citations direct
              const citationLinks = findLinksInCitations(item.value, citations);
              for (const url of citationLinks) {
                allSources.push({ url, bots: answerFile.bots });
              }

            } catch (error) {
              logger.debug(`Error reading answer file ${answerFile.path}: ${error}`);
              continue;
            }
          }

          // Deduplicate by (url + bots) combination
          item.sources = deduplicateSources(allSources);

          if (item.sources.length > 0) {
            totalEntitiesProcessed++;
            totalSourcesFound += item.sources.length;

            // Calculate unique URLs and bots for this entity
            const uniqueUrls = new Set(item.sources.map(s => s.url)).size;
            const uniqueBots = new Set(item.sources.map(s => s.bots)).size;

            logger.debug(
              `  ${sectionName}:"${item.value}" → ${item.sources.length} sources ` +
              `(${uniqueUrls} unique URLs, ${uniqueBots} bots)`
            );
          }
        }
      }

      // Save enriched data back to file
      const comment = `// Source links extracted on ${new Date().toISOString()}`;
      await saveDataJs(compiledFile, dataKey, data, comment);

      processedCount++;
      logger.updateProgress(currentIndex, `${question.folder} - ✓`);

    } catch (error) {
      logger.error(`Failed to process ${question.folder}: ${error instanceof Error ? error.message : String(error)}`);
      throw new PipelineCriticalError(
        `Failed to process ${question.folder}: ${error instanceof Error ? error.message : String(error)}`,
        CURRENT_MODULE_NAME,
        project
      );
    }
  }

  // Complete progress
  logger.completeProgress(`Processed ${processedCount} questions`);

  // Add summary statistics
  logger.addStat('Questions processed', processedCount);
  logger.addStat('Entities with sources', totalEntitiesProcessed);
  logger.addStat('Total source links', totalSourcesFound);
  if (totalEntitiesProcessed > 0) {
    logger.addStat('Avg sources per entity', (totalSourcesFound / totalEntitiesProcessed).toFixed(1));
  }

  logger.info(`Source link extraction complete`);
  await logger.showSummary();
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
  await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);

  // Initialize logger
  await logger.initialize(import.meta.url, project);

  await enrichGetSourceLinksForEntities(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
});
