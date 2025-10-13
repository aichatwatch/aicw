import { promises as fs, existsSync } from 'fs';
import path from 'path';
import vm from 'node:vm';
import { OpenAI } from 'openai';
import { DirentLike } from '../config/types.js';
import { ModelConfig, getAIAIPresetWithModels } from '../utils/model-config.js';
import { QUESTIONS_DIR, 
  QUESTION_DATA_COMPILED_DATE_DIR, 
  ENRICH_GENERATE_SUMMARY_PROMPT_PATH, 
  PROJECT_DIR, 
  CAPTURE_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { replaceMacrosInTemplate,  waitForEnterInInteractiveMode, formatSingleAnswer } from '../utils/misc-utils.js';
import { removeNonProjectModels } from '../utils/project-utils.js';
import { logger } from '../utils/compact-logger.js';
import { callAIWithRetry, createAiClientInstance } from '../utils/ai-caller.js';
import { isInterrupted } from '../utils/delay.js';
import { loadProjectModelConfigs, getTargetDateFromProjectOrEnvironment, getProjectNameFromCommandLine, loadProjectModelConfigs_FIRST, validateAndLoadProject, validateModelsAIPresetForProject, ModelType } from '../utils/project-utils.js';
import { cleanContentFromAI } from '../utils/content-cleaner.js';
import { loadDataJs, saveDataJs } from '../utils/project-utils.js';
import { renderMarkdownToHtml } from '../utils/markdown-utils.js';
import { PipelineCriticalError } from '../utils/pipeline-errors.js';

// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

/**
 * Build answers section from raw answer files
 */
async function buildAnswersSection(project: string, question: string, date: string): Promise<string> {
  const answersDir = path.join(CAPTURE_DIR(project), question, 'answers', date);
  const modelsForAnswer = await loadProjectModelConfigs(project, ModelType.GET_ANSWER);
  let section = '';

  try {
    const botDirs = 
      await removeNonProjectModels(
        await fs.readdir(answersDir, { withFileTypes: true }),
        modelsForAnswer
      );

    for (const botDir of botDirs) {

      const answerFile = path.join(answersDir, botDir.name, 'answer.md');
      if (existsSync(answerFile)) {
        const content = await fs.readFile(answerFile, 'utf-8');
        section += await formatSingleAnswer(botDir.name, content);
      }
    }
  } catch (error) {
    logger.warn(`Could not read answers directory: ${answersDir}`);
  }

  return section;
}


/**
 * Generate summary with fallback models - reusing pattern from extract.ts
 */
export async function generateAISummary(project: string, prompt: string, cfg: ModelConfig): Promise<string> {

  logger.debug(`Attempting summary generation with model ${cfg.display_name} (${cfg.model})`);

  try {
    const aiClientInstance = createAiClientInstance(cfg);

    // Use centralized AI caller with retry logic
    const chat = await callAIWithRetry(
      aiClientInstance,
      cfg,
      {
        model: cfg.model,
        messages: [
          { role: 'system', content: 'You are an expert marketing analyst creating executive summaries. Output HTML content directly without any JSON wrapping or quotes.' },
          { role: 'user', content: prompt }
        ]
      },
      {
        cacheNamePrefix: CURRENT_MODULE_NAME,
        contextInfo: `Generating summary with ${cfg.display_name}`
      }
    );

    let result = chat.choices[0]?.message?.content || '';

    // Clean up common AI response issues
    result = result.trim();

    // If AI wrapped it in quotes despite instructions, remove them
    if (result.startsWith('"') && result.endsWith('"')) {
      result = result.slice(1, -1);
    }

    logger.debug(`Summary generation successful with ${cfg.display_name}, result length: ${result.length} characters`);

    return result;

  } catch (error: any) {
    logger.warn(`Failed to generate summary with ${cfg.display_name}: ${error.message}`);
    throw new PipelineCriticalError(
      `Failed to generate summary with ${cfg.display_name}: ${error.message}`,
      CURRENT_MODULE_NAME,
      project
    );

  }

}


export async function enrichAddSummary(project: string, targetDate: string): Promise<void> {
  // Initialize logger for this summary generation run
  await logger.initialize(import.meta.url, project);

  logger.info(`Starting AI summary generation for project: ${project}`);

  // Load summary prompt template
  const template = await fs.readFile(ENRICH_GENERATE_SUMMARY_PROMPT_PATH, 'utf-8');
  logger.debug(`Loaded summary prompt template`);

  // Try to load project configuration to get ai_preset
  const modelToUse = await loadProjectModelConfigs_FIRST(project, ModelType.GENERATE_SUMMARY);

  const baseQ: string = QUESTIONS_DIR(project);
  logger.debug(`Questions directory: ${baseQ}`);

  try {
    const questionDirs: DirentLike[] = await fs.readdir(baseQ, { withFileTypes: true }) as DirentLike[];
    logger.debug(`Found ${questionDirs.length} items in questions directory`);

    // filtering out aggregated directory
    const directories = questionDirs.filter(dirent => dirent.isDirectory() && dirent.name !== AGGREGATED_DIR_NAME);
    logger.info(`Found ${directories.length} questions/folders to process`);

    // Start progress tracking
    logger.startProgress(directories.length, 'questions');

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let currentIndex = 0;

    for (const dirent of questionDirs) {
      // Check for interruption at the start of each iteration
      if (isInterrupted()) {
        logger.info('Operation cancelled by user, stopping batch processing...');
        throw new Error('Operation cancelled');
      }

      if (!dirent.isDirectory()) {
        logger.warn(`Skipping non-directory item: ${dirent.name}`);
        continue;
      }

      // Skip the aggregated directory
      if (dirent.name === AGGREGATED_DIR_NAME) {
        logger.debug(`Skipping aggregated directory: ${dirent.name}`);
        continue;
      }

      currentIndex++;
      logger.updateProgress(currentIndex, `Processing ${dirent.name}...`);

      // Look for enriched data file
      const compiledDir: string = QUESTION_DATA_COMPILED_DATE_DIR(project, dirent.name, targetDate);
      const dataFile = path.join(compiledDir, `${targetDate}-data.js`);

      // Check if data file exists
      if (!existsSync(dataFile)) {
        logger.warn(`Skipping ${dirent.name} - no enriched data file found`);
        throw new PipelineCriticalError(
          `No enriched data file found for ${dirent.name}`, 
          CURRENT_MODULE_NAME, 
          project
        );
      }

      try {
        // Load existing data
        logger.debug(`Loading data from: ${dataFile}`);
        const { data, dataKey } = await loadDataJs(dataFile);

        // Build the prompt
        logger.debug(`Building summary prompt for ${dirent.name}`);
        const answersSection = await buildAnswersSection(project, dirent.name, targetDate);

        if (!answersSection) {
          logger.warn(`Skipping ${dirent.name} - no answers found`);
          throw new PipelineCriticalError(
            `No answers found for ${dirent.name}`, 
            CURRENT_MODULE_NAME, 
            project
          );
        }

        const prompt = await replaceMacrosInTemplate(template, {
          '{{REPORT_QUESTION}}': data.report_question,
          '{{REPORT_DATE}}': targetDate,
          '{{ANSWERS}}': answersSection
        });

        logger.debug(`Generating summary for ${dirent.name}`);        

        // Generate summary with fallback models
        let summary = await generateAISummary(project, prompt, modelToUse);

        logger.info(`Successfully generated summary with model: ${modelToUse.display_name}`);

        // Store original summary (cleaning moved to client-side)
        // Update data with summary
        data.summary = summary;
        data.summaryHtml = renderMarkdownToHtml(summary);

        // Save updated data
        logger.debug(`Writing updated data to: ${dataFile}`);
        await saveDataJs(dataFile, dataKey, data);

        logger.updateProgress(currentIndex, `${dirent.name} - ✓`);
        logger.info(`Successfully added summary to ${dirent.name}`);
        processedCount++;

      } catch (error) {
        // Check if operation was cancelled by user
        if (error instanceof Error && error.message === 'Operation cancelled') {
          throw error; // Re-throw to stop the entire batch
        }

        logger.error(`Error processing ${dirent.name}: ${error instanceof Error ? error.message : String(error)}`);
        errorCount++;
        throw new PipelineCriticalError(
          `Error processing ${dirent.name}: ${error instanceof Error ? error.message : String(error)}`, 
          CURRENT_MODULE_NAME, 
          project
        );
      }
    }

    // Complete progress
    logger.completeProgress(`Generated ${processedCount} summaries`);

    // Add summary stats
    logger.addStat('Processed', processedCount);
    logger.addStat('Skipped', skippedCount);
    if (errorCount > 0) {
      logger.addStat('Errors', errorCount);
    }

    logger.info(`Summary generation complete. Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
    await logger.showSummary();

  } catch (error) {
    logger.error(`Failed to read questions directory: ${error instanceof Error ? error.message : String(error)}`);
    await logger.showSummary();
    throw error;
  }
}

// Legacy main function for backward compatibility
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
 await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);
  await validateModelsAIPresetForProject(project, ModelType.GENERATE_SUMMARY);
  await enrichAddSummary(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
