import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/compact-logger.js';
import { waitForEnterInInteractiveMode } from '../utils/misc-utils.js';
import { AICallerBatch, AIEnrichmentConfig } from '../utils/ai-caller-batch.js';
import { markItemAsAISourced, prepareStepFiles } from '../utils/enrich-data-utils.js';
import { loadDataJs, saveDataJs, readQuestions, loadProjectModelConfigs_FIRST, validateModelsAIPresetForProject } from '../utils/project-utils.js';
import { PipelineCriticalError, createMissingFileError } from '../utils/pipeline-errors.js';
import { getTargetDateFromProjectOrEnvironment, validateAndLoadProject } from '../utils/project-utils.js';
import { getProjectNameFromCommandLine } from '../utils/project-utils.js';
import { isValidLink } from '../utils/validate-links.js';
import { ModelType } from '../utils/project-utils.js';
import { ModelConfig } from '../utils/model-config.js';
import { collectEntitiesForSection, needsToEnrichAttribute, getTotalInSection } from '../utils/enrich-entity-utils.js';
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
  // will return only entities with predicted values
  const entitiesWithPredictedLinks = predictAttributeValueForEntities(
      data,
      entitiesRaw,
      ATTRIBUTE_NAME
  );

  if(entitiesWithPredictedLinks && entitiesWithPredictedLinks.length > 0){
    logger.info(`  └─ Section '${sectionName}': ${entitiesWithPredictedLinks.length} entities "link" values were predicted from "links" section`);
    entitiesWithPredictedLinks.forEach((entity: any) => {
      // updating the original item with predicted value for this item
      data[sectionName][entity.originalIndex][ATTRIBUTE_NAME] = entity[ATTRIBUTE_NAME];
    });
  }

  // once again filter and now exclude entites which are present in entitesWithPredictedLInks
  const entities = entitiesRaw.filter((entity: any) => !entitiesWithPredictedLinks.some((e: any) => e.id === entity.id));
  const totalInSection = getTotalInSection(data, sectionName);

  if (totalInSection === 0) {
    return { updatedCount, emptyResponseCount };
  }

  if (entities.length === 0) {
    logger.info(`  └─ Section '${sectionName}': 0/${totalInSection} entities need "${ATTRIBUTE_NAME}" enrichment (all already have non-empty "${ATTRIBUTE_NAME}
      )`);
    return { updatedCount, emptyResponseCount };
  }

  logger.info(`  └─ Section '${sectionName}': ${entities.length}/${totalInSection} entities need link enrichment`);

  // Prepare items for AI enrichment (don't include type in value, prompt is section-specific now)
  const items = entities.map(entity => ({
    id: entity.id,
    value: entity.value
  }));

  // Create enricher with section context
  const enricher = new AICallerBatch(project, ModelType.GENERATE_LINKS_FOR_ENTITIES);

  // Configure AI enrichment with section-specific prompt
  const config: AIEnrichmentConfig = {
    modelToUse: modelToUse,
    promptTemplatePath: promptPath,
    responseFormat: 'csv',
    csvColumns: ['id', 'link'],
    batchSize: MAX_ENTITIES_PER_BATCH,
    temperature: 0.1,
    maxTokens: 3000,
    cacheNamePrefix: `${CURRENT_MODULE_NAME}_${sectionName}`,  // Separate cache per section
  };

  try {
    // Use AI batch enricher to get entity URLs
    const results = await enricher.enrichItems(items, config);

    // Update entities with URLs
    for (const entity of entities) {
      const result = results.get(entity.id);

      // Skip if no result from AI
      if (!result || !result.link) {
        emptyResponseCount++;
        logger.debug(`No AI result for "${entity.value}"`);
        continue;
      }

      const link = result.link;

      // Skip if AI returned invalid/unknown link values
      if (link === 'unknown' || !isValidLink(link)) {
        emptyResponseCount++;
        logger.debug(`Skipping invalid link for "${entity.value}": ${link}`);
        continue;
      }

      // Defensive check: verify entity still needs a link
      const currentEntity = data[entity.sectionName][entity.originalIndex];
      if (!needsToEnrichAttribute(currentEntity, ATTRIBUTE_NAME)) {
        logger.debug(`Entity "${entity.value}" already has a valid link, skipping`);
        continue;
      }

      // Safe to update: entity needs link AND AI provided valid link
      data[entity.sectionName][entity.originalIndex].link = link;

      // Mark as AI-sourced
      data[entity.sectionName][entity.originalIndex] = await markItemAsAISourced(
        data[entity.sectionName][entity.originalIndex],
        ATTRIBUTE_NAME
      );

      updatedCount++;
      logger.debug(`Added link for "${entity.value}": ${link}`);
    }

    // Log section results
    if (updatedCount > 0) {
      logger.info(`     ✓ Successfully added ${updatedCount} links to ${sectionName}`);
    }

    if (emptyResponseCount > 0) {
      logger.info(`     ℹ AI returned ZERO links for ${emptyResponseCount}/${entities.length} ${sectionName}`);
    }

  } catch (error) {
    logger.error(`Failed to enrich links for section '${sectionName}': ${error}`);
    throw error;
  }

  return { updatedCount, emptyResponseCount };
}

interface QuestionEntry {
  folder: string;
  question: string;
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
      await processEntityLinksForFile(project, files.inputPath, files.outputPath);
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
