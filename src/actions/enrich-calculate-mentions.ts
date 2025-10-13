/**
 * Enrich Calculate Mentions
 *
 * This module calculates how many times each entity is mentioned by different AI models.
 * It counts mentions, tracks which models mentioned each item, and calculates percentages.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { DirentLike } from '../config/types.js';
import { QUESTIONS_DIR, CAPTURE_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { logger } from '../utils/compact-logger.js';
import { waitForEnterInInteractiveMode } from '../utils/misc-utils.js';
import { extractHostname } from '../utils/link-classifier.js';
import { isInterrupted } from '../utils/delay.js';
import { MAIN_SECTIONS } from '../config/entities.js';
import { PipelineCriticalError, createMissingFileError } from '../utils/pipeline-errors.js';
import {
  EnrichedItem,
  AnswerData,
  prepareStepFiles
} from '../utils/enrich-data-utils.js';
import { loadProjectModelConfigs, loadDataJs, saveDataJs, removeNonProjectModels } from '../utils/project-utils.js';
import { getProjectNameFromCommandLine, validateAndLoadProject } from '../utils/project-utils.js';
import { getTargetDateFromProjectOrEnvironment } from '../utils/project-utils.js';
import { ModelType } from '../utils/project-utils.js';

// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);


/**
 * Helper function to escape special regex characters
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a string to a flexible regular expression pattern
 * that handles variations in spacing, punctuation, and URL encoding
 */
function stringToFlexibleRegExp(str: string): RegExp {
  // Escape special regex characters
  const escapedStr = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Replace non-alphanumeric characters with a flexible pattern
  const flexiblePattern = escapedStr.replace(/[^a-zA-Z0-9]+/g, (match) => {
    // Check if this is a Unicode character sequence
    const isUnicode = match.split('').some(char => char.charCodeAt(0) > 127);

    if (isUnicode) {
      // For Unicode characters, create exact character alternatives with URL encoding
      const encodedChars = match.split('').map(char => {
        const encoded = encodeURIComponent(char);
        if (encoded !== char) {
          const escapedEncoded = encoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return `(?:${escapeRegExp(char)}|${escapedEncoded})`;
        }
        return escapeRegExp(char);
      }).join('');
      return encodedChars;
    } else {
      // For ASCII non-alphanumeric (spaces, punctuation), use flexible matching
      const encodedChars = match.split('').map(char => {
        const encoded = encodeURIComponent(char);
        if (encoded !== char) {
          const escapedEncoded = encoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (char === '?') return `(?:\\?|%3F)`;
          else if (char === '+') return `(?:\\+|%2B)`;
          else if (char === '%') return `(?:%|%25)`;
          return `(?:${char}|${escapedEncoded})`;
        }
        return escapeRegExp(char);
      }).join('');
      return `(?:[\\s\\-_.,;:!?'"()\\[\\]{}]+|${encodedChars})`;
    }
  });

  return new RegExp(flexiblePattern, 'gi');
}

/**
 * Mask URLs in markdown links [text](url) with # symbols of same length
 * This prevents counting entity names that appear in URL slugs while preserving
 * character positions for accurate appearanceOrder and excerpt extraction
 */
function maskMarkdownLinkUrls(text: string): string {
  // Match markdown links: [text](url)
  // Captures: [1] = display text, [2] = url
  return text.replace(/(\[[^\]]+\])\(([^\)]+)\)/g, (match, displayText, url) => {
    // Replace URL with same number of # symbols to preserve character positions
    const maskedUrl = '#'.repeat(url.length);
    return `${displayText}(${maskedUrl})`;
  });
}

/**
 * Count mentions of a term in answer text
 */
function countMentionsInAnswer(
  term: string,
  answerText: string,
  captureDate?: string
): { count: number; firstAppearanceOrder: number; excerpts: any[] } {
  const lowerAnswer = answerText.toLowerCase();
  let lowerTerm = term.toLowerCase();

  // Check if this looks like a URL/domain
  const isUrl = lowerTerm.includes('.') && !lowerTerm.includes(' ');

  // If searching for non-URL entity, mask markdown link URLs to avoid false matches
  // in URL slugs (e.g., "vahan-chakhalyan" in https://linkedin.com/in/vahan-chakhalyan/)
  const textToSearch = isUrl ? answerText : maskMarkdownLinkUrls(answerText);
  const lowerTextToSearch = textToSearch.toLowerCase();

  let count = 0;
  let firstAppearanceOrder = -1;
  const excerpts: any[] = [];
  const CONTEXT_CHARS = 100;

  // Helper to calculate line and column from position
  const getLineAndColumn = (pos: number): { line: number; column: number } => {
    let line = 1;
    let column = 1;
    for (let i = 0; i < pos; i++) {
      if (answerText[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return { line, column };
  };

  // Helper to normalize URLs for comparison
  const normalizeUrl = (url: string): string => {
    let normalized = url.toLowerCase();
    normalized = normalized.replace(/^https?:\/\//, '');
    normalized = normalized.replace(/^www\./, '');
    normalized = normalized.replace(/\/$/, '');
    normalized = normalized.split(/[?#]/)[0];
    return normalized;
  };

  const matches: RegExpMatchArray[] = [];

  if (isUrl) {
    // Find all URLs in the answer text
    const normalizedSearchTerm = normalizeUrl(lowerTerm);
    const urlRegex = /(?:\[([^\]]+)\]\()?((?:https?:\/\/)?(?:www\.)?[a-z0-9][-a-z0-9._]*\.[a-z]{2,}(?:\/[^\s)]*)?)/gi;

    let urlMatch;
    while ((urlMatch = urlRegex.exec(answerText)) !== null) {
      const fullUrl = urlMatch[2];
      const normalizedFoundUrl = normalizeUrl(fullUrl);

      if (normalizedFoundUrl === normalizedSearchTerm ||
          normalizedFoundUrl.startsWith(normalizedSearchTerm + '/') ||
          normalizedSearchTerm.startsWith(normalizedFoundUrl + '/')) {
        const matchObj = {
          0: urlMatch[0],
          index: urlMatch.index,
          input: answerText,
          groups: undefined
        } as RegExpMatchArray;
        matches.push(matchObj);
      }
    }

    // Also check for plain domain references
    const escapedTerm = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const simpleRegex = new RegExp('\\b' + escapedTerm + '\\b', 'gi');
    let simpleMatch;
    while ((simpleMatch = simpleRegex.exec(answerText)) !== null) {
      const alreadyCaptured = matches.some(m =>
        m.index !== undefined &&
        simpleMatch.index !== undefined &&
        m.index <= simpleMatch.index &&
        m.index + m[0].length >= simpleMatch.index + simpleMatch[0].length
      );
      if (!alreadyCaptured) {
        matches.push(simpleMatch);
      }
    }
  } else {
    // Not a URL, try flexible regex approach first, fallback to indexOf if regex fails
    let regexSuccess = false;

    try {
      const searchRegex = stringToFlexibleRegExp(lowerTerm);
      let match;
      while ((match = searchRegex.exec(lowerTextToSearch)) !== null) {
        matches.push(match);
      }
      regexSuccess = true;
    } catch (regexError) {
      // Regex creation or execution failed, fall back to simple string search
      logger.debug(`Regex failed for term "${lowerTerm}", using indexOf fallback: ${regexError}`);

      // Use case-insensitive indexOf (both strings are already lowercase)
      let searchIndex = 0;
      while ((searchIndex = lowerTextToSearch.indexOf(lowerTerm, searchIndex)) !== -1) {
        // Create a proper RegExpMatchArray-compatible object
        const matchArray = [answerText.substr(searchIndex, lowerTerm.length)] as RegExpMatchArray;
        matchArray.index = searchIndex;
        matchArray.input = answerText;
        matches.push(matchArray);
        searchIndex += 1; // Move past this position to find overlapping matches
      }
      regexSuccess = true; // Mark as handled
    }

    // Check for possessive forms (only if term is suitable)
    if (lowerTerm.length > 3 && !lowerTerm.includes('.')) {
      try {
        const possessivePattern = new RegExp(`\\b${escapeRegExp(lowerTerm)}'s\\b`, 'gi');
        let possessiveMatch;
        while ((possessiveMatch = possessivePattern.exec(textToSearch)) !== null) {
          const alreadyCaptured = matches.some(m =>
            m.index !== undefined &&
            possessiveMatch.index !== undefined &&
            Math.abs(m.index - possessiveMatch.index) < 2
          );
          if (!alreadyCaptured) {
            matches.push(possessiveMatch);
          }
        }
      } catch (possessiveError) {
        // Possessive pattern failed, skip it (not critical)
        logger.debug(`Possessive pattern failed for term "${lowerTerm}": ${possessiveError}`);
      }
    }
  }

  // Process all matches
  count = matches.length;

  if (matches.length > 0) {
    // Sort matches by position
    matches.sort((a, b) => (a.index || 0) - (b.index || 0));

    firstAppearanceOrder = matches[0].index || -1;

    // Create excerpts
    for (const match of matches.slice(0, 5)) { // Limit to 5 excerpts
      if (match.index !== undefined) {
        const startPos = Math.max(0, match.index - CONTEXT_CHARS);
        const endPos = Math.min(answerText.length, match.index + match[0].length + CONTEXT_CHARS);
        const excerpt = answerText.substring(startPos, endPos).trim();
        const { line, column } = getLineAndColumn(match.index);

        excerpts.push({
          appearanceOrder: match.index,
          excerpt,
          line,
          column,
          captureDate
        });
      }
    }
  }

  return { count, firstAppearanceOrder, excerpts };
}

/**
 * Read answers from capture directory
 */
async function readAnswers(
  folder: string,
  dates: string | string[],
  allowedModels: any[]
): Promise<AnswerData[]> {
  const answers: AnswerData[] = [];
  const datesToProcess = Array.isArray(dates) ? dates : [dates];

  for (const date of datesToProcess) {
    const answersDir = path.join(folder, 'answers', date);
    try {
      const modelDirs = await removeNonProjectModels(
        await fs.readdir(answersDir, { withFileTypes: true }),
        allowedModels
      );

      for (const modelDir of modelDirs) {
        const modelId = modelDir.name;
        const answerFile = path.join(answersDir, modelId, 'answer.md');
        try {
          const text = await fs.readFile(answerFile, 'utf-8');
          answers.push({ text, modelId, date });
        } catch (error) {
          // Answer file doesn't exist for this model
          continue;
        }
      }
    } catch (error) {
      // Date directory doesn't exist
      continue;
    }
  }

  return answers;
}

/**
 * Calculate mentions for all items
 */
function calculateMentions(
  items: EnrichedItem[],
  answers: AnswerData[],
  currentDate: string,
  models: any[]
): void {
  if (!Array.isArray(items)) return;

  // Step 1: Collect mentions for each item in each answer
  for (const item of items) {
    // Get the value to display
    const displayValue = (item.value || item.link || item.keyword || item.organization || item.source || '').toString();
    if (!displayValue) continue;

    // For links, use the domain for counting mentions
    let searchTerm = displayValue;
    if (item.type === 'link') {
      const urlToCheck = item.link || item.value || displayValue;
      const domain = extractHostname(urlToCheck);
      if (domain) {
        searchTerm = domain;
        // Store the original full URL to preserve it
        if (urlToCheck !== domain) {
          (item as any).fullUrl = urlToCheck;
        }
      }
    }

    let totalMentions = 0;
    const mentionsByModel: { [modelId: string]: number } = {};
    const firstAppearanceOrderCharByModel: { [modelId: string]: number } = {};
    const excerptsByModel: { [modelId: string]: any[] } = {};

    // Initialize mentions by model
    models.forEach(model => {
      mentionsByModel[model.id] = 0;
      firstAppearanceOrderCharByModel[model.id] = -1;
    });

    // Count mentions
    for (const answer of answers) {
      const { count, firstAppearanceOrder, excerpts } = countMentionsInAnswer(searchTerm, answer.text, currentDate);

      // Only count mentions from the current date's answers
      if (!answer.date || answer.date === currentDate) {
        mentionsByModel[answer.modelId] = count;
        excerptsByModel[answer.modelId] = excerpts;
        if (count > 0) {
          totalMentions += count;
          firstAppearanceOrderCharByModel[answer.modelId] = firstAppearanceOrder;
        }
      }
    }

    // Store data on item
    item.mentionsByModel = mentionsByModel;
    item.firstAppearanceOrderCharByModel = firstAppearanceOrderCharByModel;
    item.excerptsByModel = excerptsByModel;
    item.mentions = totalMentions;

    // Add bots property - comma-separated string of bot IDs that mentioned this item
    const botsWithMentions = Object.entries(mentionsByModel)
      .filter(([botId, mentions]) => (mentions as number) > 0)
      .map(([botId]) => botId);
    item.bots = botsWithMentions.join(',');
    item.botCount = botsWithMentions.length;
    item.uniqueModelCount = botsWithMentions.length;

    // Restore full URL if it was preserved
    if ((item as any).fullUrl) {
      item.link = (item as any).fullUrl;
      item.value = (item as any).fullUrl;
      delete (item as any).fullUrl;
    }
  }

  // Step 2: Calculate mentions as percentage
  const totalMentionsAcrossAllItems = items.reduce((sum, item) => sum + (item.mentions || 0), 0);

  // Calculate total mentions by each bot across all items
  const totalMentionsByModel: { [botId: string]: number } = {};
  models.forEach(model => {
    totalMentionsByModel[model.id] = items.reduce((sum, item) =>
      sum + ((item.mentionsByModel && item.mentionsByModel[model.id]) || 0), 0
    );
  });

  items.forEach(item => {
    // Store as decimal (0.0 to 1.0) not percentage (0 to 100)
    item.mentionsAsPercent = totalMentionsAcrossAllItems > 0
      ? Number((item.mentions! / totalMentionsAcrossAllItems).toFixed(5))
      : 0;

    // Calculate mentions as percent by model
    item.mentionsAsPercentByModel = {};
    models.forEach(model => {
      const botTotalMentions = totalMentionsByModel[model.id] || 0;
      const itemModelMentions = (item.mentionsByModel && item.mentionsByModel[model.id]) || 0;
      item.mentionsAsPercentByModel[model.id] = botTotalMentions > 0
        ? Number((itemModelMentions / botTotalMentions).toFixed(5))
        : 0;
    });
  });
}

/**
 * Main function to calculate mentions for enriched data
 */
export async function enrichCalculateMentions(project: string, targetDate: string): Promise<void> {
  logger.info(`Starting mentions calculation for project: ${project}${targetDate ? ` for date: ${targetDate}` : ''}`);

  // Load project models
  const projectModelsForAnswer = await loadProjectModelConfigs(project, ModelType.GET_ANSWER);

  // Get questions
  const questionsDir = QUESTIONS_DIR(project);
  const questionDirs = await fs.readdir(questionsDir, { withFileTypes: true }) as DirentLike[];
  const actualQuestions = questionDirs.filter(d => d.isDirectory() && d.name !== AGGREGATED_DIR_NAME);

  // Start progress tracking
  logger.startProgress(actualQuestions.length, 'questions');

  let processedCount = 0;
  let currentIndex = 0;

  for (const dir of actualQuestions) {
    if (isInterrupted()) {
      logger.info('Operation cancelled by user');
      throw new Error('Operation cancelled');
    }

    currentIndex++;
    logger.updateProgress(currentIndex, `Processing ${dir.name}...`);

    // Prepare files using universal interface
    const files = await prepareStepFiles({
      project,
      questionFolder: dir.name,
      date: targetDate,
      stepName: CURRENT_MODULE_NAME
    });

    if (!files.exists) {
      throw createMissingFileError(dir.name, files.inputPath, 'enrich-calculate-mentions');
    }

    try {
      // Load compiled data
      const { data, dataKey } = await loadDataJs(files.inputPath);

      // Use the date from prepareStepFiles
      const currentDate = files.date;

      // Read answers for this question
      const captureDir = path.join(CAPTURE_DIR(project), dir.name);
      const answers = await readAnswers(captureDir, currentDate, projectModelsForAnswer);

      // calculate
      for (const arrayType of MAIN_SECTIONS) {
        if (data[arrayType] && Array.isArray(data[arrayType])) {
          calculateMentions(data[arrayType], answers, currentDate, projectModelsForAnswer);
        }
      }

      // Save enriched data back to same file
      const comment = `// Mentions calculated on ${new Date().toISOString()}`;
      await saveDataJs(files.outputPath, dataKey, data, comment);

      processedCount++;
      logger.updateProgress(currentIndex, `${dir.name} - ✓`);
    } catch (error) {
      // Re-throw critical errors to stop pipeline
      if (error instanceof PipelineCriticalError) {
        logger.error(`Pipeline-stopping error in ${error.questionFolder}: ${error.message}`);
        throw error;
      }

      // Log and continue for other errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error processing ${dir.name}: ${errorMsg}`);
      throw new PipelineCriticalError(
        `Failed to process ${dir.name}: ${error instanceof Error ? error.message : String(error)}`, 
        CURRENT_MODULE_NAME, 
        project
      );
    }
  }

  // Complete progress
  logger.completeProgress(`Processed ${processedCount} questions`);
  logger.info(`Mentions calculation complete. Processed: ${processedCount}`);
  await logger.showSummary();
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
 await validateAndLoadProject(project); 
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);  

  // Initialize logger
  await logger.initialize(import.meta.url, project);

  await enrichCalculateMentions(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
