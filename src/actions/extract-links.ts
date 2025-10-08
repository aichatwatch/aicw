import { promises as fs } from 'fs';
import { DirentLike } from '../config/types.js';
import path from 'path';
import vm from 'node:vm';
import { QuestionEntry } from '../config/types.js';
import { QUESTIONS_DIR, QUESTION_DATA_COMPILED_DATE_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { logger } from '../utils/compact-logger.js';
import { waitForEnterInInteractiveMode } from '../utils/misc-utils.js';
import { writeFileAtomic } from '../utils/misc-utils.js';
import { removeTrackingParams } from '../utils/url-utils.js';
import { cleanContentFromAI } from '../utils/content-cleaner.js';
import { getProjectNameFromCommandLine, getTargetDateFromProjectOrEnvironment, loadProjectModelConfigs, removeNonProjectModels, validateAndLoadProject } from '../utils/project-utils.js';
import { DEFAULT_OTHER_LINK_TYPE_SHORT_NAME } from '../config/user-paths.js';
import { createMissingFileError, PipelineCriticalError } from '../utils/pipeline-errors.js';
import { readQuestions, loadDataJs, saveDataJs } from '../utils/project-utils.js';
import { ModelType } from '../utils/project-utils.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);
import { cleanUrl, extractDomainFromUrl } from '../utils/url-utils.js';

// Link extraction regex patterns
const REGEX_ANY_LINK = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
const REGEX_MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const REGEX_DOMAIN_PATTERN = /\b([a-z0-9][-a-z0-9]*\.)+[a-z]{2,}\b/gi;

const DUMMY_CHAR_TO_REPLACE_SUBSTRING = '*';

function fillSubstringWithPlaceholder(content: string, match: RegExpExecArray): string {
  const urlStart = match.index + 1;
  let fillLength = 0;
  for (let i = 0; i < match.length; i++) {
    fillLength += match[i].length;
  }
  const urlEnd = urlStart + fillLength;
  // generate new string 
  return content.slice(0, urlStart) 
    + DUMMY_CHAR_TO_REPLACE_SUBSTRING.repeat(fillLength) 
    + content.slice(urlEnd);
}

/**
 * Extract links from answers content in compiled data
 */
function extractLinksFromContent(content: string): string[] {
  const links = new Set<string>();
  const processedDomains = new Set<string>();

  // First, extract markdown links [text](url)
  let match;
  const markdownRegex = new RegExp(REGEX_MARKDOWN_LINK);
  while ((match = markdownRegex.exec(content)) !== null) {
    const url = cleanUrl(match[2]); 
    if (url && !url.startsWith('#')) { // Skip anchor links
      links.add(url);
      processedDomains.add(extractDomainFromUrl(url));
      // replace the link with a placeholder with the length of the link
      content = fillSubstringWithPlaceholder(content, match);
    }
  }

  // Then extract plain URLs
  const urlRegex = new RegExp(REGEX_ANY_LINK);
  while ((match = urlRegex.exec(content)) !== null) {
    const url = cleanUrl(match[1]);
    if (url) {
      links.add(url);
      processedDomains.add(extractDomainFromUrl(url));
      // replace the link with a placeholder with the length of the link
      content = fillSubstringWithPlaceholder(content, match);
    }
  }

  // Finally, look for domains mentnions (which maybe not links but just domains)
  const domainRegex = new RegExp(REGEX_DOMAIN_PATTERN);
  while ((match = domainRegex.exec(content)) !== null) {
    const link = match[0].toLowerCase();

    // Skip if this domain was already extracted as part of a full URL
    if (!processedDomains.has(link) && !links.has(link)) {
      // Skip common file extensions that might match the pattern
      if (!link.endsWith('.md') && !link.endsWith('.js') &&
          !link.endsWith('.ts') && !link.endsWith('.json')) {
        links.add(link);
        processedDomains.add(link);
      }
    }
  }

  // Convert to array and filter out duplicates based on domain
  const uniqueLinks = Array.from(links);

  // Remove image links
  const filteredLinks = uniqueLinks.filter(link =>
    !link.endsWith('.jpg') &&
    !link.endsWith('.png') &&
    !link.endsWith('.gif') &&
    !link.endsWith('.jpeg') &&
    !link.endsWith('.webp') &&
    !link.endsWith('.svg')
  );

  return filteredLinks;
}


/**
 * Read all answers from original answer.md files for a question and date
 */
async function readAnswersFromOriginalFiles(project: string, questionFolder: string, targetDate: string): Promise<string> {
  
  const aiModelsForAnswerInProject = await loadProjectModelConfigs(project, ModelType.GET_ANSWER);
  const answersBaseDir = path.join(QUESTIONS_DIR(project), questionFolder, 'answers');
  let allAnswersContent = '';

  try {
    const dateDirs = await fs.readdir(answersBaseDir, { withFileTypes: true });

    for (const dateDir of dateDirs) {
      if (!dateDir.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(dateDir.name)) {
        continue;
      }

      // Only process the target date
      if (dateDir.name !== targetDate) {
        continue;
      }

      const dateAnswersDir = path.join(answersBaseDir, dateDir.name);

      const modelDirs = 
        await removeNonProjectModels(
          await fs.readdir(dateAnswersDir, { withFileTypes: true }),
          aiModelsForAnswerInProject
        );      

      for (const modelDir of modelDirs) {

        const answerFile = path.join(dateAnswersDir, modelDir.name, 'answer.md');
        try {
          const text = await fs.readFile(answerFile, 'utf-8');
          allAnswersContent += text + '\n';
        } catch (error) {
          // Skip if answer.md doesn't exist for this model
          logger.debug(`No answer.md found for ${questionFolder}/${targetDate}/${modelDir.name}`);
        }
      }
    }
  } catch (error) {
    logger.warn(`Error reading answers for ${questionFolder}: ${error}`);
    throw new PipelineCriticalError(
      `Error reading original answer files for ${questionFolder}: ${error}`,
      CURRENT_MODULE_NAME,
      project
    );
  }

  return allAnswersContent;
}

/**
 * Main function to extract links from original answer files
 */
export async function extractLinks(project: string, targetDate: string): Promise<void> {

  logger.info(`Extracting links from original answer.md files for project: ${project}`);

  const questions = await readQuestions(project);

  logger.info(`Processing ${questions.length} questions for date: ${targetDate}`);

  // Start progress tracking
  logger.startProgress(questions.length, 'questions');

  let processedCount = 0;
  let totalLinksExtracted = 0;

  for (const [index, question] of questions.entries()) {
    const currentIndex = index + 1;
    logger.updateProgress(currentIndex, `Processing ${question.folder}...`);

    // Path to compiled data file
    const compiledFile = path.join(
      QUESTION_DATA_COMPILED_DATE_DIR(project, question.folder, targetDate),
      `${targetDate}-data.js`
    );

    // Check if compiled file exists - CRITICAL: required for link extraction
    try {
      await fs.access(compiledFile);
    } catch {
      throw createMissingFileError(question.folder, compiledFile, logger.currentActionName);
    }

    try {
      // Load compiled data
      const { data, dataKey } = await loadDataJs(compiledFile);

      // Check if links already extracted
      // but they MUST be empty before we start!
      if (data.links && Array.isArray(data.links) && data.links.length > 0) {
        logger.debug(`Links already extracted for ${question.folder} (${data.links.length} links)`);
        throw new PipelineCriticalError(
          `Links already extracted for ${question.folder} (${data.links.length} links)`,
          CURRENT_MODULE_NAME,
          project
        );
      }

      // Read answers content from original answer.md files
      const answersContent = await readAnswersFromOriginalFiles(project, question.folder, targetDate);

      if (!answersContent || answersContent.trim().length === 0) {
        logger.error(`No answer content found in original files for ${question.folder}`);
        throw new PipelineCriticalError(
          `No answer content found in original answer.md files for ${question.folder}`,
          CURRENT_MODULE_NAME,
          project
        );
      }

      // Extract links from content
      // from all answers! We will later check them again to see which link mentioned by which model
      const extractedLinks = extractLinksFromContent(answersContent);

      // Create links array with proper structure
      data.links = extractedLinks.map(url => ({
        type: 'link',
        value: url,
        link: url,
        linkType: DEFAULT_OTHER_LINK_TYPE_SHORT_NAME // Will be classified in next steps
      }));

      // Save updated data
      await saveDataJs(compiledFile, dataKey, data);

      const linkCount = data.links.length;
      totalLinksExtracted += linkCount;
      processedCount++;

      logger.updateProgress(currentIndex, `${question.folder} - ✓ ${linkCount} links`);
      logger.info(`Extracted ${linkCount} links from ${question.folder}`);

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

  // Add summary stats
  logger.addStat('Processed', processedCount);
  logger.addStat('Total Links', totalLinksExtracted);

  logger.info(`Link extraction complete. Processed: ${processedCount}, Total links: ${totalLinksExtracted}`);
  await logger.showSummary();
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
 await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);

  // Initialize logger
  await logger.initialize(import.meta.url, project);

  await extractLinks(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
