import { promises as fs } from 'fs';
import path from 'path';
import vm from 'node:vm';
import { DirentLike } from '../config/types.js';
import { QuestionEntry } from '../config/types.js';
import { QUESTIONS_DIR, QUESTION_DATA_COMPILED_DATE_DIR, PROMPTS_DIR, PROJECT_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { replaceMacrosInTemplate, waitForEnterInInteractiveMode, writeFileAtomic } from '../utils/misc-utils.js';
import { logger } from '../utils/compact-logger.js';
import { AICallerBatch, AIEnrichmentConfig } from '../utils/ai-caller-batch.js';
import { SimpleCache } from '../utils/simple-cache.js';
import { extractHostname, getLinkTypeName } from '../utils/link-classifier.js';
import { loadLinkTypes } from '../config/link-types-loader.js';
import { cleanContentFromAI } from '../utils/content-cleaner.js';
import { getAIAIPresetWithModels } from '../utils/model-config.js';
import { PipelineCriticalError, createMissingFileError, createMissingDataError } from '../utils/pipeline-errors.js';
import { getTargetDateFromProjectOrEnvironment, getProjectNameFromCommandLine, validateAndLoadProject, validateModelsAIPresetForProject } from '../utils/project-utils.js';
import { markItemAsAISourced, prepareStepFiles } from '../utils/enrich-data-utils.js';
import { readQuestions, loadDataJs, saveDataJs } from '../utils/project-utils.js';
import { DEFAULT_OTHER_LINK_TYPE_SHORT_NAME } from '../config/user-paths.js';
import { loadProjectModelConfigs_FIRST } from '../utils/project-utils.js';
import { ModelType } from '../utils/project-utils.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);


// Maximum number of links to classify with AI per question
const MAX_AI_CLASSIFICATION_LINKS = 50;

// Cache for link types
const linkCache = new SimpleCache('ai-linkTypes');


/**
 * Main function to classify links using AI
 */
export async function getLinkTypeWithAI(project: string, targetDate: string): Promise<void> {
  // Initialize logger
  await logger.initialize(import.meta.url, project);

  logger.info(`Starting AI link classification for project: ${project}`);

  // Initialize cache
  await linkCache.load().catch(() => {
    logger.debug('Link cache not found, starting fresh');
  });

  const categoriesInfo = loadLinkTypes().map(lt => `${lt.code}: ${lt.name} (${lt.description})`).join('\n');

  // Create AI enricher
  const enricher = new AICallerBatch(
    project, 
    ModelType.GET_LINK_TYPE,
    {
      '{{CATEGORIES}}': categoriesInfo,
    }

  );

  const questions = await readQuestions(project);

  logger.info(`Processing ${questions.length} questions for date: ${targetDate}`);

  // Start progress tracking
  logger.startProgress(questions.length, 'questions');

  let processedCount = 0;
  let skippedCount = 0;
  let totalAIClassified = 0;

  // Track AI classification statistics
  const aiClassificationStats: { [key: string]: number } = {};

  // Get valid link type codes for validation
  const validCodes = new Set(loadLinkTypes().map(lt => lt.code));

  for (const [index, question] of questions.entries()) {
    const currentIndex = index + 1;
    logger.updateProgress(currentIndex, `AI classifying links for ${question.folder}...`);

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


      const { data, dataKey } = await loadDataJs(files.inputPath);

      // Check if links exist - CRITICAL: links are required for AI classification
      if (!data.links || !Array.isArray(data.links) || data.links.length === 0) {
        throw createMissingDataError(question.folder, 'Links', 'previous link processing', CURRENT_MODULE_NAME);
      }

      // Filter only 'oth' links (DEFAULT_OTHER_LINK_TYPE_SHORT_NAME)
      const othLinks = data.links.filter((link: any) => link.linkType === DEFAULT_OTHER_LINK_TYPE_SHORT_NAME);

      if (othLinks.length === 0) {
        logger.debug(`No unclassified links for ${question.folder}`);
        logger.updateProgress(currentIndex, `${question.folder} - All classified`);
        continue;
      }

      logger.debug(`Found ${othLinks.length} unclassified links for ${question.folder}`);

      // Limit the number of links to classify with AI
      const linksToClassify = othLinks.slice(0, MAX_AI_CLASSIFICATION_LINKS);

      if (linksToClassify.length < othLinks.length) {
        logger.warn(`Limiting AI classification to ${MAX_AI_CLASSIFICATION_LINKS} links (${othLinks.length} total)`);
      }

      // Check cache first
      let cacheHits = 0;
      for (let link of linksToClassify) {
        const linkUrl = link.link || link.value;
        const normalizedUrl = extractHostname(linkUrl);

        if (normalizedUrl && linkCache.has(normalizedUrl)) {
          const cachedType = linkCache.get(normalizedUrl);
          if (cachedType && cachedType !== DEFAULT_OTHER_LINK_TYPE_SHORT_NAME) {
            link.linkType = cachedType;
            link = await markItemAsAISourced(link, 'linkType');
            cacheHits++;
            aiClassificationStats[cachedType] = (aiClassificationStats[cachedType] || 0) + 1;
          }
        }
      }

      if (cacheHits > 0) {
        logger.debug(`Used cached classifications for ${cacheHits} links`);
      }

      // Filter out cached links for AI processing
      const uncachedLinks = linksToClassify.filter((link: any) => link.linkType === DEFAULT_OTHER_LINK_TYPE_SHORT_NAME);

      if (uncachedLinks.length === 0) {
        logger.info(`All links classified from cache for ${question.folder}`);
        await saveDataJs(files.outputPath, dataKey, data);
        processedCount++;
        continue;
      }

      // Prepare items for AI enrichment
      const items = uncachedLinks.map((link: any, i: number) => ({
        id: i,
        value: extractHostname(link.link || link.value) || link.link || link.value,
        type: 'link'
      }));

      const modelToUse = await loadProjectModelConfigs_FIRST(project, ModelType.GET_LINK_TYPE);

      // Configure AI enrichment
      const config: AIEnrichmentConfig = {
        modelToUse: modelToUse,
        promptTemplatePath: path.join(PROMPTS_DIR, 'enrich-get-link-type.md'),
        responseFormat: 'csv',
        csvColumns: ['id', 'linkType'],
        batchSize: 15,
        temperature: 0.1, // Low temperature for consistent classification
        maxTokens: 2000,
        cacheNamePrefix: CURRENT_MODULE_NAME,
      };

      // Use AI to classify
      const results = await enricher.enrichItems(items, config);

      // Update link types with AI results
      let aiClassifiedCount = 0;
      uncachedLinks.forEach((link: any, i: number) => {
        if (results.has(i)) {
          const result = results.get(i);
          const newType = result?.linkType;

          // Validate the link type
          if (newType && validCodes.has(newType)) {
            link.linkType = newType;
            link = markItemAsAISourced(link, 'linkType');
            aiClassifiedCount++;
            totalAIClassified++;

            // Update statistics
            aiClassificationStats[newType] = (aiClassificationStats[newType] || 0) + 1;

            // Cache the result
            const normalizedUrl = extractHostname(link.link || link.value);
            if (normalizedUrl) {
              linkCache.set(normalizedUrl, newType);
            }

            logger.debug(`AI classified "${link.link || link.value}" as "${newType}" (${getLinkTypeName(newType)})`);
          } else {
            logger.warn(`AI returned invalid link type "${newType}" for "${link.link || link.value}"`);
          }
        }
      });

      // Save updated data
      await saveDataJs(files.outputPath, dataKey, data);

      // Save cache periodically
      if (processedCount % 5 === 0) {
        await linkCache.save();
      }

      processedCount++;

      const remainingOth = othLinks.filter((link: any) => link.linkType === DEFAULT_OTHER_LINK_TYPE_SHORT_NAME).length;
      logger.updateProgress(currentIndex, `${question.folder} - ✓ AI: ${aiClassifiedCount}, Remaining: ${remainingOth}`);
      logger.info(`AI classified ${aiClassifiedCount} links for ${question.folder}, ${remainingOth} remain unclassified`);

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

  // Save cache at the end
  await linkCache.save();

  // Complete progress
  logger.completeProgress(`Processed ${processedCount} questions`);

  // Log AI classification statistics
  if (Object.keys(aiClassificationStats).length > 0) {
    logger.info('AI classification statistics:');
    const sortedStats = Object.entries(aiClassificationStats)
      .sort((a, b) => b[1] - a[1]);

    for (const [linkType, count] of sortedStats) {
      const typeName = getLinkTypeName(linkType);
      logger.info(`  ${linkType} (${typeName}): ${count} links`);
    }
  }

  // Add summary stats
  logger.addStat('Processed', processedCount);
  logger.addStat('Skipped', skippedCount);
  logger.addStat('AI Classified', totalAIClassified);

  logger.info(`AI link classification complete. Processed: ${processedCount}, Skipped: ${skippedCount}, AI Classified: ${totalAIClassified}`);
  await logger.showSummary();
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
  await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);
  // Validate that all required API keys are configured
  await validateModelsAIPresetForProject(project, ModelType.GET_LINK_TYPE);
 

  await getLinkTypeWithAI(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
