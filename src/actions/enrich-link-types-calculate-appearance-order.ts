import { promises as fs } from 'fs';
import path from 'path';
import vm from 'node:vm';
import { DirentLike } from '../config/types.js';
import { QuestionEntry } from '../config/types.js';
import { QUESTIONS_DIR, QUESTION_DATA_COMPILED_DATE_DIR, PROJECT_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { waitForEnterInInteractiveMode, writeFileAtomic } from   '../utils/misc-utils.js';
import { logger } from '../utils/compact-logger.js';
import { loadProjectModelConfigs ,  getTargetDateFromProjectOrEnvironment, getProjectNameFromCommandLine, validateAndLoadProject } from '../utils/project-utils.js';
import { PipelineCriticalError, createMissingFileError, createMissingDataError } from '../utils/pipeline-errors.js';
import { loadDataJs, saveDataJs } from '../utils/project-utils.js';
import { readQuestions } from '../utils/project-utils.js';
import { prepareStepFiles } from '../utils/enrich-data-utils.js';
import { ModelType } from '../utils/project-utils.js';

// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);


/**
 * Calculate appearance order statistics for linkTypes
 * Extracted from old aggregateLinkTypes function - Phase 2 (appearance order only)
 */
function calculateAppearanceOrderForLinkTypes(linkTypes: any[], models: any[]): void {
  logger.debug('Calculating appearance order for linkTypes');

  // Calculate average appearanceOrder from sources - EXTRACTED FROM OLD WORKING CODE
  linkTypes.forEach(item => {
    // Calculate average appearanceOrder from sources - EXTRACTED FROM OLD WORKING CODE
    const sourceAppearanceOrders = item.sources
      .map((s: any) => s.appearanceOrder)
      .filter((order: any) => order && order > 0);

    if (sourceAppearanceOrders.length > 0) {
      item.appearanceOrder = Math.round(
        sourceAppearanceOrders.reduce((sum: number, order: number) => sum + order, 0) / sourceAppearanceOrders.length
      );
    } else {
      item.appearanceOrder = 999; // No valid appearance order - EXTRACTED FROM OLD WORKING CODE
    }
  });

  // Aggregate appearanceOrderByModel from sources - EXTRACTED FROM OLD WORKING CODE
  linkTypes.forEach(item => {
    item.appearanceOrderByModel = {};
    models.forEach(model => {
      const modelSources = item.sources.filter((s: any) =>
        s.mentionsByModel && s.mentionsByModel[model.id] > 0
      );

      if (modelSources.length > 0) {
        const orders = modelSources
          .map((s: any) => s.appearanceOrderByModel?.[model.id])
          .filter((o: any) => o && o > 0);

        if (orders.length > 0) {
          item.appearanceOrderByModel[model.id] = Math.round(
            orders.reduce((sum: number, o: number) => sum + o, 0) / orders.length
          );
        } else {
          item.appearanceOrderByModel[model.id] = -1; // EXTRACTED FROM OLD WORKING CODE
        }
      } else {
        item.appearanceOrderByModel[model.id] = -1; // EXTRACTED FROM OLD WORKING CODE
      }
    });
  });

  logger.debug(`Calculated appearance order for ${linkTypes.length} link types`);
}

/**
 * Main function to calculate appearance order for linkTypes (EE only)
 */
export async function enrichLinkTypesCalculateAppearanceOrder(project: string, targetDate: string): Promise<void> {
  // Initialize logger
  await logger.initialize(import.meta.url, project);

  logger.info(`Starting linkTypes appearance order calculation for project: ${project}`);

  // Load project models
  const projectModels = await loadProjectModelConfigs(project, ModelType.GET_ANSWER);

  const questions = await readQuestions(project);


  logger.info(`Processing ${questions.length} questions for date: ${targetDate}`);

  // Start progress tracking
  logger.startProgress(questions.length, 'questions');

  let processedCount = 0;
  let skippedCount = 0;

  for (const [index, question] of questions.entries()) {
    const currentIndex = index + 1;
    logger.updateProgress(currentIndex, `Calculating appearance order for ${question.folder}...`);

    const files = await prepareStepFiles({
      project,
      questionFolder: question.folder,
      date: targetDate,
      stepName: CURRENT_MODULE_NAME
    });

    if (!files.exists) {
      throw createMissingFileError(question.folder, files.inputPath, 'enrich-link-types-calculate-appearance-order');
    }

    try {


      const { data, dataKey } = await loadDataJs(files.inputPath);

      // Check if linkTypes exist - CRITICAL: must be created by mentions module
      if (!data.linkTypes || !Array.isArray(data.linkTypes) || data.linkTypes.length === 0) {
        throw createMissingDataError(question.folder, 'linkTypes', 'enrich-link-types-calculate-mentions', 'enrich-link-types-calculate-appearance-order');
      }

      // Calculate appearance order for linkTypes
      calculateAppearanceOrderForLinkTypes(data.linkTypes, projectModels);

      // Save updated data
      await saveDataJs(files.outputPath, dataKey, data);

      processedCount++;

      logger.updateProgress(currentIndex, `${question.folder} - ✓ ${data.linkTypes.length} types`);
      logger.info(`Calculated appearance order for ${data.linkTypes.length} link types for ${question.folder}`);

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
        `Error processing ${question.folder}: ${errorMsg}`, 
        CURRENT_MODULE_NAME, 
        project
      );
    }
  }

  // Complete progress
  logger.completeProgress(`Processed ${processedCount} questions`);

  // Add summary stats
  logger.addStat('Processed', processedCount);
  logger.addStat('Skipped', skippedCount);

  logger.info(`LinkTypes appearance order calculation complete. Processed: ${processedCount}, Skipped: ${skippedCount}`);
  await logger.showSummary();
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
   await validateAndLoadProject(project);   
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);

  await enrichLinkTypesCalculateAppearanceOrder(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
