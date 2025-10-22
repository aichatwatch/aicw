import { promises as fs } from 'fs';
import path from 'path';
import vm from 'node:vm';
import { DirentLike } from '../config/types.js';
import { QUESTIONS_DIR, QUESTION_DATA_COMPILED_DATE_DIR, PROMPTS_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { replaceMacrosInTemplate, waitForEnterInInteractiveMode, writeFileAtomic } from '../utils/misc-utils.js';
import { logger } from '../utils/compact-logger.js';
import { cleanContentFromAI } from '../utils/content-cleaner.js';
import { AICallerBatch, AIEnrichmentConfig } from '../utils/ai-caller-batch.js';
import { loadProjectModelConfigs_FIRST, loadDataJs, saveDataJs, getTargetDateFromProjectOrEnvironment, getProjectNameFromCommandLine, validateAndLoadProject, validateModelsAIPresetForProject } from '../utils/project-utils.js';
import { readQuestions } from '../utils/project-utils.js';
import { markItemAsAISourced, prepareStepFiles } from '../utils/enrich-data-utils.js';
import { PipelineCriticalError, createMissingFileError } from '../utils/pipeline-errors.js';
import { ModelType } from '../utils/project-utils.js';
import { ModelConfig } from '../utils/model-config.js';
import { collectEntitiesForSection, needsToEnrichAttribute, getTotalInSection } from '../utils/enrich-entity-utils.js';
import { getEnrichmentPromptPath } from '../utils/enrich-prompt-discovery.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
import { MAIN_SECTIONS } from '../config/constants-entities.js';
import { filterSectionsToProcess } from '../utils/action-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

// Configuration
const MAX_SIMILAR_TERMS = 3;
const MAX_ENTITIES_PER_BATCH = 30;
const ATTRIBUTE_NAME = 'similar'; // This action enriches the 'similar' attribute

// define sections to include (to process them only)
const SECTIONS_TO_INCLUDE = [
  "keywords"
]
// if SECTIONS_TO_INCLUDE is empty then define sections to exclude (will process all except these then)
const SECTIONS_TO_EXCLUDE = [
]
/**
 * Merge similar terms with existing ones, removing duplicates
 */
function mergeSimilarTerms(existing: string, newTerms: string[]): string {
  const existingArray = existing ? existing.split(',').map(t => t.trim()).filter(t => t) : [];
  const allTerms = [...new Set([...existingArray, ...newTerms])]; // Remove duplicates
  return allTerms.slice(0, MAX_SIMILAR_TERMS).join(','); // Limit to MAX_SIMILAR_TERMS
}

/**
 * Process similar terms for a single file using section-by-section approach
 */
async function processSimilarTermsForFile(
  project: string,
  inputFile: string,
  outputFile: string
): Promise<void> {
  logger.debug(`Processing: ${inputFile}`);

  // Load data
  const { data, dataKey } = await loadDataJs(inputFile);

  // Get model to use for this enrichment
  const modelToUse = await loadProjectModelConfigs_FIRST(project, ModelType.GENERATE_SIMILAR_FOR_ENTITIES);

  let totalUpdated = 0;
  let totalEmptyResponses = 0;
  const sectionsProcessed: string[] = [];

  const sectionsToProcess: readonly string[] = filterSectionsToProcess(MAIN_SECTIONS, SECTIONS_TO_EXCLUDE, SECTIONS_TO_INCLUDE);  
  // Process each section separately
  for (const sectionName of sectionsToProcess) {

    const { updatedCount, emptyResponseCount } = await processSectionSimilar(
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
    const comment = `// Similar terms added on ${new Date().toISOString()}`;
    await saveDataJs(outputFile, dataKey, data, comment);
    logger.info(`\nTotal: Successfully added similar terms to ${totalUpdated} entities across ${sectionsProcessed.length} sections`);
  } else {
    logger.info(`\nNo similar terms were added`);
  }

  if (totalEmptyResponses > 0) {
    logger.info(`Total: AI returned ZERO similar terms for ${totalEmptyResponses} entities`);
  }
}

/**
 * Process a single section for similar term enrichment
 */
async function processSectionSimilar(
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
    logger.info(`  └─ Section '${sectionName}': No similar enrichment configured (no prompt file)`);
    return { updatedCount, emptyResponseCount };
  }

  // Collect entities from this section that need similar terms
  const entities = collectEntitiesForSection(data, sectionName, ATTRIBUTE_NAME);
  const totalInSection = getTotalInSection(data, sectionName);

  if (totalInSection === 0) {
    return { updatedCount, emptyResponseCount };
  }

  if (entities.length === 0) {
    logger.info(`  └─ Section '${sectionName}': 0/${totalInSection} entities need similar enrichment (all already have similar)`);
    return { updatedCount, emptyResponseCount };
  }

  logger.info(`  └─ Section '${sectionName}': ${entities.length}/${totalInSection} entities need similar enrichment`);

  // Prepare items for AI enrichment (don't include type in value, prompt is section-specific now)
  const items = entities.map(entity => ({
    id: entity.id,
    value: entity.value
  }));

  // Create enricher with section context
  const enricher = new AICallerBatch(project, ModelType.GENERATE_SIMILAR_FOR_ENTITIES);

  // Configure AI enrichment with section-specific prompt
  const config: AIEnrichmentConfig = {
    modelToUse: modelToUse,
    promptTemplatePath: promptPath,
    responseFormat: 'csv',
    csvColumns: ['id', 'similar'],
    batchSize: MAX_ENTITIES_PER_BATCH,
    temperature: 0.3,
    maxTokens: 4000,
    cacheNamePrefix: `${CURRENT_MODULE_NAME}_${sectionName}`,  // Separate cache per section
  };

  try {
    // Use AI batch enricher to generate similar terms
    const results = await enricher.enrichItems(items, config);

    // Update entities with similar terms
    for (const entity of entities) {
      const result = results.get(entity.id);

      if (!result || !result.similar) {
        emptyResponseCount++;
        logger.debug(`No AI result for "${entity.value}"`);
        continue;
      }

      // Parse similar terms from result
      const newTerms = Array.isArray(result.similar) ? result.similar :
        (typeof result.similar === 'string' ? result.similar.split(',').map(s => s.trim()).filter(s => s) : []);

      if (newTerms.length === 0) {
        emptyResponseCount++;
        logger.debug(`AI returned ZERO similar terms for "${entity.value}"`);
        continue;
      }

      // Defensive check: verify entity still needs similar terms
      const currentEntity = data[entity.sectionName][entity.originalIndex];
      if (!needsToEnrichAttribute(currentEntity, ATTRIBUTE_NAME)) {
        logger.debug(`Entity "${entity.value}" already has similar terms, skipping`);
        continue;
      }

      // Merge with existing similar terms
      const existingSimilar = data[entity.sectionName][entity.originalIndex].similar || '';
      data[entity.sectionName][entity.originalIndex].similar = mergeSimilarTerms(existingSimilar, newTerms);

      // Mark as AI-sourced
      data[entity.sectionName][entity.originalIndex] = await markItemAsAISourced(
        data[entity.sectionName][entity.originalIndex],
        ATTRIBUTE_NAME
      );

      updatedCount++;
      logger.debug(`Added similar terms for "${entity.value}": ${data[entity.sectionName][entity.originalIndex].similar}`);
    }

    // Log section results
    if (updatedCount > 0) {
      logger.info(`     ✓ Successfully added similar terms to ${updatedCount} ${sectionName}`);
    }

    if (emptyResponseCount > 0) {
      logger.info(`     ℹ AI returned ZERO similar terms for ${emptyResponseCount}/${entities.length} ${sectionName}`);
    }

  } catch (error) {
    logger.error(`Failed to enrich similar terms for section '${sectionName}': ${error}`);
    throw error;
  }

  return { updatedCount, emptyResponseCount };
}

/**
 * Main function to add similar terms to enriched data
 */
export async function enrichAddSimilar(project: string, targetDate: string): Promise<void> {
  // Initialize logger
  await logger.initialize(import.meta.url, project);

  logger.info(`Starting similar terms generation for project: ${project}${targetDate ? ` for date: ${targetDate}` : ''}`);

  try {
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
      await processSimilarTermsForFile(
        project,
        files.inputPath,
        files.outputPath
      );
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
      continue;
    }
  }

    // Complete progress
    logger.completeProgress(`Processed ${processedCount} questions`);

    // Add summary stats
    logger.addStat('Processed', processedCount);
    logger.addStat('Skipped', skippedCount);

    logger.info(`Similar terms generation complete. Processed: ${processedCount}, Skipped: ${skippedCount}`);
    await logger.showSummary();
  } finally {
    //
  }
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
  await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);
  // Validate models for our type of action
  await validateModelsAIPresetForProject(project, ModelType.GENERATE_SIMILAR_FOR_ENTITIES);

  await enrichAddSimilar(project, targetDate);
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
