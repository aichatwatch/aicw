import { promises as fs } from 'fs';
import path from 'path';
import vm from 'node:vm';
import { DirentLike } from '../config/types.js';
import { QuestionEntry } from '../config/types.js';
import { QUESTIONS_DIR, QUESTION_DATA_COMPILED_DATE_DIR, PROJECT_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { waitForEnterInInteractiveMode, writeFileAtomic } from '../utils/misc-utils.js';
import { logger } from '../utils/compact-logger.js';
import { LINK_TYPE_NAMES } from '../utils/link-classifier.js';
import { cleanContentFromAI } from '../utils/content-cleaner.js';
import { loadProjectModelConfigs, getTargetDateFromProjectOrEnvironment, getProjectNameFromCommandLine, validateAndLoadProject } from '../utils/project-utils.js';
import { loadDataJs, saveDataJs, readQuestions } from '../utils/project-utils.js';
import { PipelineCriticalError, createMissingFileError, createMissingDataError } from '../utils/pipeline-errors.js';
import { prepareStepFiles } from '../utils/enrich-data-utils.js';
import { DEFAULT_OTHER_LINK_TYPE_LONG_NAME, DEFAULT_OTHER_LINK_TYPE_SHORT_NAME } from '../config/user-paths.js';
import { ModelType } from '../utils/project-utils.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);



/**
 * Create linkTypes array from classified links by aggregating mentions
 * Extracted from old aggregateLinkTypes function - Phase 1 (mentions only)
 */
function createLinkTypesMentions(sources: any[], models: any[], currentDate: string): any[] {
  logger.debug('Starting linkTypes mentions aggregation');

  // Create a map to group sources by linkType
  const typeMap = new Map<string, any>();

  // Process each source - EXTRACTED FROM OLD WORKING CODE
  for (const source of sources) {
    const typeCode = source.linkType || DEFAULT_OTHER_LINK_TYPE_SHORT_NAME;

    if (!typeMap.has(typeCode)) {
      // Initialize the linkType entry - REUSED FROM OLD VERSION
      typeMap.set(typeCode, {
        type: 'linkType',
        code: typeCode,
        value: LINK_TYPE_NAMES[typeCode] || DEFAULT_OTHER_LINK_TYPE_LONG_NAME,
        mentions: 0,
        mentionsByModel: {},
        sources: [], // Keep for subsequent calculations
        bots: new Set<string>(),
        botCount: 0,
        uniqueModelCount: 0
      });
    }

    const typeEntry = typeMap.get(typeCode)!;

    // Aggregate mentions - EXTRACTED FROM OLD WORKING CODE
    typeEntry.mentions += source.mentions || 0;

    // Aggregate mentions by model - EXTRACTED FROM OLD WORKING CODE
    if (source.mentionsByModel) {
      for (const [modelId, mentions] of Object.entries(source.mentionsByModel)) {
        typeEntry.mentionsByModel[modelId] = (typeEntry.mentionsByModel[modelId] || 0) + (mentions as number);
      }
    }

    // Collect bots that mentioned this source - EXTRACTED FROM OLD WORKING CODE
    if (source.bots) {
      source.bots.split(',').forEach((bot: string) => {
        if (bot) typeEntry.bots.add(bot);
      });
    }

    // Keep track of individual sources for subsequent calculations - EXTRACTED FROM OLD WORKING CODE
    typeEntry.sources.push({
      link: source.link,
      mentions: source.mentions,
      appearanceOrder: source.appearanceOrder,
      appearanceOrderByModel: source.appearanceOrderByModel,
      mentionsByModel: source.mentionsByModel,
      influence: source.influence,
      influenceByModel: source.influenceByModel,
      weightedInfluence: source.weightedInfluence
    });
  }

  // Convert map to array and finalize mentions calculations - EXTRACTED FROM OLD WORKING CODE
  const linkTypes = Array.from(typeMap.values()).map(entry => {
    // Convert bots Set to comma-separated string - EXTRACTED FROM OLD WORKING CODE
    entry.bots = Array.from(entry.bots).sort().join(',');
    entry.botCount = entry.bots ? entry.bots.split(',').length : 0;
    entry.uniqueModelCount = entry.botCount;

    // Calculate mentionsAsPercentByModel - EXTRACTED FROM OLD WORKING CODE
    entry.mentionsAsPercentByModel = {};
    models.forEach(model => {
      const totalMentions = sources.reduce((sum, s) =>
        sum + ((s.mentionsByModel && s.mentionsByModel[model.id]) || 0), 0
      );
      entry.mentionsAsPercentByModel[model.id] = totalMentions > 0
        ? Number(((entry.mentionsByModel[model.id] || 0) / totalMentions).toFixed(5))
        : 0;
    });

    return entry;
  });

  // Calculate mentionsAsPercent - EXTRACTED FROM OLD WORKING CODE
  const totalMentions = linkTypes.reduce((sum, item) => sum + (item.mentions || 0), 0);
  linkTypes.forEach(item => {
    item.mentionsAsPercent = totalMentions > 0
      ? Number((item.mentions / totalMentions).toFixed(5))
      : 0;
  });

  logger.debug(`Created ${linkTypes.length} link types from ${sources.length} links`);
  return linkTypes;
}

/**
 * Main function to calculate mentions for linkTypes (EE only)
 */
export async function enrichLinkTypesCalculateMentions(project: string, targetDate: string): Promise<void> {
  // Initialize logger
  await logger.initialize(import.meta.url, project);

  logger.info(`Starting linkTypes mentions calculation for project: ${project}`);

  // Load project models
  const projectModels = await loadProjectModelConfigs(project, ModelType.GET_ANSWER);

  const questions = await readQuestions(project);

  logger.info(`Processing ${questions.length} questions for date: ${targetDate}`);

  // Start progress tracking
  logger.startProgress(questions.length, 'questions');

  let processedCount = 0;
  let skippedCount = 0;
  let totalLinksProcessed = 0;

  for (const [index, question] of questions.entries()) {
    const currentIndex = index + 1;
    logger.updateProgress(currentIndex, `Calculating mentions for ${question.folder}...`);

    const files = await prepareStepFiles({
      project,
      questionFolder: question.folder,
      date: targetDate,
      stepName: CURRENT_MODULE_NAME
    });

    if (!files.exists) {
      throw createMissingFileError(question.folder, files.inputPath, 'enrich-link-types-calculate-mentions');
    }

    try {


      const { data, dataKey } = await loadDataJs(files.inputPath);

      // Check if links exist - CRITICAL: links are required to create linkTypes
      const linksData = data.links || data.sources;
      if (!linksData || !Array.isArray(linksData) || linksData.length === 0) {
        const error = `CRITICAL: No "links" array were found to create linkTypes for ${question.folder} in ${files.inputPath}. Previous step probably failed.`;
        logger.error(error);
        throw new Error(error);
      }

      // Create linkTypes array with mentions calculations
      data.linkTypes = createLinkTypesMentions(linksData, projectModels, targetDate);

      totalLinksProcessed += linksData.length;

      // Save updated data
      await saveDataJs(files.outputPath, dataKey, data);

      processedCount++;

      logger.updateProgress(currentIndex, `${question.folder} - ✓ ${data.linkTypes.length} types`);
      logger.info(`Created ${data.linkTypes.length} link types from ${linksData.length} links for ${question.folder}`);

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
      continue;
    }
  }

  // Complete progress
  logger.completeProgress(`Processed ${processedCount} questions`);

  // Add summary stats
  logger.addStat('Processed', processedCount);
  logger.addStat('Skipped', skippedCount);
  logger.addStat('Links Processed', totalLinksProcessed);

  logger.info(`LinkTypes mentions calculation complete. Processed: ${processedCount}, Skipped: ${skippedCount}, Links: ${totalLinksProcessed}`);
  await logger.showSummary();
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
  await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);

  await enrichLinkTypesCalculateMentions(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
