import { promises as fs } from 'fs';
import { DirentLike } from '../config/types.js';
import path from 'path';
import vm from 'node:vm';
import { QuestionEntry } from '../config/types.js';
import { QUESTIONS_DIR, QUESTION_DATA_COMPILED_DATE_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { logger } from '../utils/compact-logger.js';
import { waitForEnterInInteractiveMode, writeFileAtomic } from '../utils/misc-utils.js';
import { LinkClassifier } from '../utils/link-classifier.js';
import { cleanContentFromAI } from '../utils/content-cleaner.js';
import { getTargetDateFromProjectOrEnvironment, getProjectNameFromCommandLine, validateAndLoadProject } from '../utils/project-utils.js';
import { loadDataJs, saveDataJs, readQuestions } from '../utils/project-utils.js';
import { PipelineCriticalError, createMissingFileError, createMissingDataError } from '../utils/pipeline-errors.js';
import { DEFAULT_OTHER_LINK_TYPE_SHORT_NAME } from '../config/user-paths.js';
import { prepareStepFiles } from '../utils/enrich-data-utils.js';
import { ModelType } from '../utils/project-utils.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);


/**
 * Main function to classify links using deterministic patterns
 */
export async function enrichLinksClassification(project: string, targetDate: string): Promise<void> {
  logger.info(`Starting deterministic link classification for project: ${project}`);

  // Create link classifier instance
  const classifier = new LinkClassifier();

  const questions = await readQuestions(project);

  logger.info(`Processing ${questions.length} questions for date: ${targetDate}`);

  // Start progress tracking
  logger.startProgress(questions.length, 'questions');

  let processedCount = 0; 
  let totalClassified = 0;

  // Track classification statistics
  const classificationStats: { [key: string]: number } = {};

  for (const [index, question] of questions.entries()) {
    const currentIndex = index + 1;
    logger.updateProgress(currentIndex, `Classifying links for ${question.folder}...`);

    // Prepare files using universal interface
    const files = await prepareStepFiles({
      project,
      questionFolder: question.folder,
      date: targetDate,
      stepName: CURRENT_MODULE_NAME
    });

    // Check if input exists - CRITICAL: file must exist
    if (!files.exists) {
      throw createMissingFileError(question.folder, files.inputPath, CURRENT_MODULE_NAME);
    }

    try {

      // Load compiled data with links
      const { data, dataKey } = await loadDataJs(files.inputPath);

      // Check if links exist - CRITICAL: links are required for classification
      if (!data.links || !Array.isArray(data.links) || data.links.length === 0) {
        throw createMissingDataError(question.folder, 'Links', 'extract-links', CURRENT_MODULE_NAME);
      }

      // Apply deterministic classification
      let classifiedCount = 0;
      const linkCount = data.links.length;

      for (const link of data.links) {
        const linkUrl = link.link || link.value;

        if (!linkUrl) {
          logger.warn(`Link without URL found in ${question.folder}`);
          continue;
        }

        // Only classify if not already classified or is 'oth' (DEFAULT_OTHER_LINK_TYPE_SHORT_NAME)
        if (!link.linkType || link.linkType === DEFAULT_OTHER_LINK_TYPE_SHORT_NAME) {
          const linkType = classifier.classifyLinkType(linkUrl);
          link.linkType = linkType;

          // Track statistics
          classificationStats[linkType] = (classificationStats[linkType] || 0) + 1;

          if (linkType !== DEFAULT_OTHER_LINK_TYPE_SHORT_NAME) {
            classifiedCount++;
            totalClassified++;
            logger.debug(`Classified "${linkUrl}" as "${linkType}"`);
          }
        }
      }

      // Save updated data back to same file
      await saveDataJs(files.outputPath, dataKey, data);

      processedCount++;

      logger.updateProgress(currentIndex, `${question.folder} - ✓ ${classifiedCount}/${linkCount} classified`);
      logger.info(`Classified ${classifiedCount}/${linkCount} links for ${question.folder}`);

    } catch (error) {
      // Re-throw critical errors to stop pipeline
      if (error instanceof PipelineCriticalError) {
        logger.error(`Pipeline-stopping error in ${error.questionFolder}: ${error.message}`);
        throw error;
      }

      // Log and continue for other errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to process ${question.folder}: ${errorMsg}`);
      throw new PipelineCriticalError(
        `Failed to process ${question.folder}: ${error instanceof Error ? error.message : String(error)}`, 
        CURRENT_MODULE_NAME,
        project
      );
    }
  }

  // Complete progress
  logger.completeProgress(`Processed ${processedCount} questions`);

  // Log classification statistics
  if (Object.keys(classificationStats).length > 0) {
    logger.info('Classification statistics:');
    const sortedStats = Object.entries(classificationStats)
      .sort((a, b) => b[1] - a[1]);

    for (const [linkType, count] of sortedStats) {
      const typeName = classifier.getLinkTypeName(linkType);
      logger.info(`  ${linkType} (${typeName}): ${count} links`);
    }
  }

  // Add summary stats
  logger.addStat('Processed', processedCount);
  logger.addStat('Links Classified', totalClassified);

  // Calculate percentage classified
  if (classificationStats[DEFAULT_OTHER_LINK_TYPE_SHORT_NAME]) {
    const totalLinks = Object.values(classificationStats).reduce((a, b) => a + b, 0);
    const othCount = classificationStats[DEFAULT_OTHER_LINK_TYPE_SHORT_NAME];
    const classifiedPercent = ((totalLinks - othCount) / totalLinks * 100).toFixed(1);
    logger.info(`Deterministic classification rate: ${classifiedPercent}% (${othCount} links remain unclassified)`);
  }

  logger.info(`Link classification complete. Processed: ${processedCount}, Classified: ${totalClassified}`);
  await logger.showSummary();
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
 await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);

  // Initialize logger
  await logger.initialize(import.meta.url, project);

  await enrichLinksClassification(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
