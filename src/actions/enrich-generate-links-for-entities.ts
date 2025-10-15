import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/compact-logger.js';
import { waitForEnterInInteractiveMode } from '../utils/misc-utils.js';
import { prepareStepFiles } from '../utils/enrich-data-utils.js';
import { loadDataJs, saveDataJs, readQuestions, loadProjectModelConfigs_FIRST, validateModelsAIPresetForProject } from '../utils/project-utils.js';
import { PipelineCriticalError, createMissingFileError } from '../utils/pipeline-errors.js';
import { getTargetDateFromProjectOrEnvironment, validateAndLoadProject } from '../utils/project-utils.js';
import { getProjectNameFromCommandLine } from '../utils/project-utils.js';
import { isValidLink } from '../utils/validate-links.js';
import { ModelType } from '../utils/project-utils.js';
import { ModelConfig } from '../utils/model-config.js';
import { collectEntitiesForSection, needsToEnrichAttribute, getTotalInSection, extractLinksFromMarkdownInAnswers } from '../utils/enrich-entity-utils.js';
import { MAIN_SECTIONS } from '../config/entities.js';
import { getEnrichmentPromptPath } from '../utils/enrich-prompt-discovery.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
import { filterSectionsToProcess } from '../utils/action-utils.js';
import { predictAttributeValueForEntities } from '../utils/enrich-entity-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

const SECTIONS_TO_INCLUDE = [];
const SECTIONS_TO_EXCLUDE = [
  'links',
  'linkTypes',
  'linkDomains',
  'keywords' // no links for keywords
];

// Configuration
const MAX_ENTITIES_PER_BATCH = 20;
const ATTRIBUTE_NAME = 'link'; // This action enriches the 'link' attribute

interface Entity {
  id: number;
  value: string;
  link?: string;
  type: string;
  sectionName: string;
  originalIndex: number; // Track original position in array
}


// Note: Old helper functions removed - using section-by-section approach now

/**
 * Process entity links for a single file using section-by-section approach
 */
async function processEntityLinksForFile(
  project: string,
  questionFolder: string,
  targetDate: string,
  inputFile: string,
  outputFile: string
): Promise<void> {
  logger.debug(`Processing: ${inputFile}`);

  // Load data
  const { data, dataKey } = await loadDataJs(inputFile);

  // Get model to use for this enrichment
  const modelToUse = await loadProjectModelConfigs_FIRST(project, ModelType.GENERATE_LINKS_FOR_ENTITIES);

  let totalUpdated = 0;
  let totalEmptyResponses = 0;
  const sectionsProcessed: string[] = [];

  const sectionsToProcess: readonly string[] = filterSectionsToProcess(MAIN_SECTIONS, SECTIONS_TO_EXCLUDE, SECTIONS_TO_INCLUDE);
  // Process each section separately
  for (const sectionName of sectionsToProcess) {

    const { updatedCount, emptyResponseCount } = await processSectionLinks(
      project,
      questionFolder,
      targetDate,
      data,
      sectionName,
      modelToUse
    );

    if (updatedCount > 0 || emptyResponseCount > 0) {
      totalUpdated += updatedCount;
      totalEmptyResponses += emptyResponseCount;
      sectionsProcessed.push(sectionName);
    }
  }

  // Save updated data if any changes were made
  if (totalUpdated > 0) {
    const comment = `// Entity links added on ${new Date().toISOString()}`;
    await saveDataJs(outputFile, dataKey, data, comment);
    logger.info(`\nTotal: Successfully added ${totalUpdated} entity links across ${sectionsProcessed.length} sections`);
  } else {
    logger.info(`\nNo entity links were added`);
  }

  if (totalEmptyResponses > 0) {
    logger.warn(`Total: AI returned ZERO links for ${totalEmptyResponses} entities`);
  }
}

/**
 * Process a single section for link enrichment
 */
async function processSectionLinks(
  project: string,
  questionFolder: string,
  targetDate: string,
  data: any,
  sectionName: string,
  modelToUse: ModelConfig
): Promise<{ updatedCount: number; emptyResponseCount: number }> {
  let updatedCount = 0;
  let emptyResponseCount = 0;

  // Get prompt path for this section
  const promptPath = getEnrichmentPromptPath(sectionName, ATTRIBUTE_NAME);

  if (!promptPath) {
    logger.error(`  └─ Section '${sectionName}': No "${ATTRIBUTE_NAME}" enrichment configured (no prompt file)`);
    throw new PipelineCriticalError(
      `No "${ATTRIBUTE_NAME}" enrichment configured (no prompt file)`,
      CURRENT_MODULE_NAME,
      project
    );
  }

  // Collect entities from this section that need links
  const entitiesRaw = collectEntitiesForSection(data, sectionName, ATTRIBUTE_NAME);

  // STEP 1: Try to extract links from markdown in original answers (highest priority)
  const entitiesWithMarkdownLinks = await extractLinksFromMarkdownInAnswers(
    entitiesRaw,
    project,
    questionFolder,
    targetDate
  );

  if (entitiesWithMarkdownLinks && entitiesWithMarkdownLinks.length > 0) {
    logger.info(`  └─ Section '${sectionName}': ${entitiesWithMarkdownLinks.length} entities "link" values were extracted from markdown in answers`);
    entitiesWithMarkdownLinks.forEach((entity: any) => {
      // updating the original item with extracted markdown link
      data[sectionName][entity.originalIndex][ATTRIBUTE_NAME] = entity[ATTRIBUTE_NAME];
      updatedCount++;
    });
  }

  // Filter out entities that already have markdown links
  const entitiesAfterMarkdown = entitiesRaw.filter((entity: any) =>
    !entitiesWithMarkdownLinks.some((e: any) => e.id === entity.id)
  );

  // STEP 2: Try domain-based prediction (e.g., entityname.com)
  const entitiesWithPredictedLinks = predictAttributeValueForEntities(
    data,
    entitiesAfterMarkdown,
    ATTRIBUTE_NAME
  );

  if(entitiesWithPredictedLinks && entitiesWithPredictedLinks.length > 0){
    logger.info(`  └─ Section '${sectionName}': ${entitiesWithPredictedLinks.length} entities "link" values were predicted from "links" section`);
    entitiesWithPredictedLinks.forEach((entity: any) => {
      // updating the original item with predicted value for this item
      data[sectionName][entity.originalIndex][ATTRIBUTE_NAME] = entity[ATTRIBUTE_NAME];
      updatedCount++;
    });
  }

  return { updatedCount, emptyResponseCount };
}

/**
 * Main function to add entity links to enriched data
 */
export async function enrichGenerateLinks(project: string, targetDate: string): Promise<void> {

  logger.info(`Starting entity links enrichment for project: ${project}${targetDate ? ` for date: ${targetDate}` : ''}`);
  logger.info(`Processing sections with section-specific prompts...`);

  const questions = await readQuestions(project);

  // Start progress tracking
  logger.startProgress(questions.length, 'questions');

  let processedCount = 0;
  let skippedCount = 0;
  let currentIndex = 0;

  for (const question of questions) {
    currentIndex++;
    logger.updateProgress(currentIndex, `Processing ${question.folder}...`);

    const files = await prepareStepFiles({
      project,
      questionFolder: question.folder,
      date: targetDate,
      stepName: CURRENT_MODULE_NAME
    });

    if (!files.exists) {
      throw createMissingFileError(question.folder, files.inputPath, CURRENT_MODULE_NAME);
    }

    try {
      await processEntityLinksForFile(project, question.folder, targetDate, files.inputPath, files.outputPath);
      processedCount++;

      logger.updateProgress(currentIndex, `${question.folder} - ✓`);

    } catch (error) {
      // Re-throw critical errors to stop pipeline
      if (error instanceof PipelineCriticalError) {
        logger.error(`Pipeline-stopping error in ${error.questionFolder}: ${error.message}`);
        throw error;
      }

      // Log and continue for other errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error processing ${question.folder}: ${errorMsg}`);
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

  logger.info(`Entity links enrichment complete. Processed: ${processedCount}, Skipped: ${skippedCount}`);
  await logger.showSummary();
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
 await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);  
  await validateModelsAIPresetForProject(project, ModelType.GENERATE_LINKS_FOR_ENTITIES);

  // Initialize logger
  await logger.initialize(import.meta.url, project);

  await enrichGenerateLinks(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
