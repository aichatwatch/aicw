import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { DirentLike } from '../config/types.js';
import { ModelConfig } from '../utils/model-config.js';
import { QUESTIONS_DIR,
  QUESTION_DATA_COMPILED_DATE_DIR,
  ENRICH_GENERATE_SUMMARY_AGGREGATE_PROMPT_PATH,
  AGGREGATED_DATA_COMPILED_DATE_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { replaceMacrosInTemplate,  waitForEnterInInteractiveMode } from '../utils/misc-utils.js';
import { logger } from '../utils/compact-logger.js';
import { callAIWithRetry, createAiClientInstance } from '../utils/ai-caller.js';
import { isInterrupted } from '../utils/delay.js';
import { loadProjectModelConfigs, getTargetDateFromProjectOrEnvironment, getProjectNameFromCommandLine, loadProjectModelConfigs_FIRST, validateAndLoadProject, validateModelsAIPresetForProject, ModelType, loadDataJs, saveDataJs } from '../utils/project-utils.js';
import { PipelineCriticalError } from '../utils/pipeline-errors.js';
import { renderMarkdownToHtml } from '../utils/markdown-utils.js';
import { generateAISummary } from './enrich-generate-summary-ai.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

/**
 * Build summaries section from individual question summaries
 */
async function buildSummariesSection(project: string, targetDate: string): Promise<string> {
  const baseQ: string = QUESTIONS_DIR(project);
  let section = '';
  let foundSummaries = 0;

  try {
    const questionDirs: DirentLike[] = await fs.readdir(baseQ, { withFileTypes: true }) as DirentLike[];

    // Filter to only directories, excluding aggregated
    const directories = questionDirs.filter(dirent =>
      dirent.isDirectory() && dirent.name !== AGGREGATED_DIR_NAME
    );

    logger.debug(`Found ${directories.length} question directories to collect summaries from`);

    for (const dirent of directories) {
      const compiledDir = QUESTION_DATA_COMPILED_DATE_DIR(project, dirent.name, targetDate);
      const dataFile = path.join(compiledDir, `${targetDate}-data.js`);

      if (!existsSync(dataFile)) {
        logger.warn(`Skipping ${dirent.name} - no compiled data file found`);
        continue;
      }

      try {
        // Load the data
        const { data } = await loadDataJs(dataFile);

        // Check if summary exists
        if (!data.summary) {
          logger.warn(`Skipping ${dirent.name} - no summary found in compiled data`);
          continue;
        }

        if(!data.report_question && typeof data.report_question !== 'string') {
          throw new PipelineCriticalError(
            `No report_question is NOT as string in compiled data for ${dirent.name}`,
            CURRENT_MODULE_NAME,
            project
          );
        }

        // Add to summaries section
        section += `The summary of answers from AIs to the question: "${data.report_question}":\n${data.summary}\n\n`;
        foundSummaries++;

      } catch (error) {
        logger.warn(`Failed to load data from ${dirent.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    logger.info(`Collected ${foundSummaries} summaries from individual questions`);

  } catch (error) {
    logger.error(`Failed to read questions directory: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  return section;
}

export async function enrichAddSummary(project: string, targetDate: string): Promise<void> {
  // Initialize logger for this summary generation run
  await logger.initialize(import.meta.url, project);

  logger.info(`Starting AI aggregated summary generation for project: ${project}`);

  // Load aggregated summary prompt template
  const template = await fs.readFile(ENRICH_GENERATE_SUMMARY_AGGREGATE_PROMPT_PATH, 'utf-8');
  logger.debug(`Loaded aggregated summary prompt template`);

  // Try to load project configuration to get ai_preset
  const modelToUse = await loadProjectModelConfigs_FIRST(project, ModelType.GENERATE_SUMMARY);

  try {
    // Check for interruption
    if (isInterrupted()) {
      logger.info('Operation cancelled by user');
      throw new Error('Operation cancelled');
    }

    // Build summaries section from all individual question summaries
    logger.info('Collecting summaries from individual questions...');
    const summariesSection = await buildSummariesSection(project, targetDate);

    if (!summariesSection || summariesSection.trim() === '') {
      logger.error('No summaries found to aggregate');
      throw new PipelineCriticalError(
        'No summaries found to aggregate - please ensure individual question summaries have been generated first',
        CURRENT_MODULE_NAME,
        project
      );
    }

    // Build the prompt for aggregated summary
    logger.debug('Building aggregated summary prompt');
    const prompt = await replaceMacrosInTemplate(template, {
      '{{REPORT_DATE}}': targetDate,
      '{{SUMMARIES}}': summariesSection
    });

    logger.info('Generating aggregated summary with AI...');

    // Generate aggregated summary (returns markdown)
    let summary = await generateAISummary(project, prompt, modelToUse);   

    // Convert markdown to HTML
    const summaryHtml = renderMarkdownToHtml(summary);

    logger.info(`Successfully generated aggregated summary with model: ${modelToUse.display_name}`);

    // Prepare aggregated data directory
    const aggregatedDir = AGGREGATED_DATA_COMPILED_DATE_DIR(project, targetDate);
    const aggregatedDataFile = path.join(aggregatedDir, `${targetDate}-data.js`);

    // Ensure directory exists
    await fs.mkdir(aggregatedDir, { recursive: true });

    // Load or create aggregated data
    let data: any = {};
    let key = 'data';

    if (existsSync(aggregatedDataFile)) {
      logger.debug(`Loading existing aggregated data from: ${aggregatedDataFile}`);
      const loaded = await loadDataJs(aggregatedDataFile);
      data = loaded.data;
      key = loaded.dataKey;
    } else {
      logger.debug('Creating new aggregated data structure');
      // Create new data structure
      data = {
        report_question: 'Aggregated Report Summary',
        report_date: targetDate,
        project: project
      };
    }

    // Add summary to aggregated data
    data.summary = summary;
    data.summaryHtml = summaryHtml;

    // Save aggregated data
    logger.debug(`Writing aggregated summary to: ${aggregatedDataFile}`);
    await saveDataJs(aggregatedDataFile, key, data);

    logger.info('Aggregated summary generation complete');
    logger.addStat('Status', 'Success');
    logger.addStat('Summary Length', `${summary.length} characters`);
    await logger.showSummary();

  } catch (error) {
    // Check if operation was cancelled by user
    if (error instanceof Error && error.message === 'Operation cancelled') {
      logger.info('Operation cancelled by user');
      await logger.showSummary();
      throw error;
    }

    logger.error(`Failed to generate aggregated summary: ${error instanceof Error ? error.message : String(error)}`);
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
