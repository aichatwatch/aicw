/**
 * Transform Answers to Markdown
 *
 * Reads answer.json files and generates enhanced answer.md files
 * with full citation content (NO truncation).
 *
 * This allows:
 * - Regenerating answer.md without re-fetching from AI APIs
 * - Iterating on markdown formatting without API costs
 * - Testing different citation formats
 */

import { promises as fs } from 'fs';
import path from 'path';
import { QuestionEntry } from '../config/types.js';
import { formatAnswer } from '../utils/citation-formatter.js';
import { colorize, writeFileAtomic, waitForEnterInInteractiveMode } from '../utils/misc-utils.js';
import { CAPTURE_DIR } from '../config/paths.js';
import { readQuestions } from '../utils/project-utils.js';
import { getTargetDateFromProjectOrEnvironment, getProjectNameFromCommandLine, validateAndLoadProject } from '../utils/project-utils.js';
import { logger } from '../utils/compact-logger.js';
import { ProgressTracker } from '../utils/compact-logger.js';
import { PipelineCriticalError } from '../utils/pipeline-errors.js';
import { getModuleNameFromUrl } from '../utils/misc-utils.js';

const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

/**
 * Check if answer.json exists
 */
async function answerJsonExists(jsonPath: string): Promise<boolean> {
  try {
    await fs.stat(jsonPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse answer.json file
 */
async function readAnswerJson(jsonPath: string): Promise<any> {
  try {
    const content = await fs.readFile(jsonPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read or parse ${jsonPath}: ${error}`);
  }
}

/**
 * Transform a single answer.json to answer.md
 */
async function transformSingleAnswer(
  jsonPath: string,
  mdPath: string,
  force: boolean = false
): Promise<{ success: boolean; reason: string; size?: number }> {
  // Check if JSON exists
  if (!await answerJsonExists(jsonPath)) {
    return { success: false, reason: 'No answer.json' };
  }

  // Check if MD already exists and skip if not forcing
  if (!force) {
    try {
      const stats = await fs.stat(mdPath);
      // If MD exists and has content, skip unless --force is used
      if (stats.size > 0) {
        return { success: false, reason: 'Already exists', size: stats.size };
      }
    } catch {
      // MD doesn't exist, proceed with transformation
    }
  }

  // Read and parse answer.json
  let responseData: any;
  try {
    responseData = await readAnswerJson(jsonPath);
  } catch (error) {
    return { success: false, reason: `Parse error: ${error}` };
  }

  // Transform to enhanced markdown with full citations
  const enhancedMarkdown = await formatAnswer(responseData);

  // Write to answer.md
  try {
    await writeFileAtomic(mdPath, enhancedMarkdown);
    const stats = await fs.stat(mdPath);
    return { success: true, reason: 'Transformed', size: stats.size };
  } catch (error) {
    return { success: false, reason: `Write error: ${error}` };
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  // Check for --force flag BEFORE getting project name
  // NOTE: By default, this action ALWAYS overwrites answer.md (force = true by default)
  const args = process.argv.slice(2);
  const force = !args.includes('--no-force'); // Default to true, opt-out with --no-force

  const project = await getProjectNameFromCommandLine();
  await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);

  // Initialize logger
  await logger.initialize(import.meta.url, project);

  const questions: QuestionEntry[] = await readQuestions(project);

  if (questions.length === 0) {
    logger.warn('No questions found. Please run prepare command first.');
    return;
  }

  if (force) {
    logger.info('Regenerating ALL answer.md files (use --no-force to skip existing)');
  }

  // Scan all answer.json files
  const tasks: Array<{
    question: QuestionEntry;
    modelId: string;
    jsonPath: string;
    mdPath: string;
  }> = [];

  for (const question of questions) {
    const answersBase = path.join(CAPTURE_DIR(project), question.folder, 'answers', targetDate);

    try {
      const modelDirs = await fs.readdir(answersBase, { withFileTypes: true });

      for (const modelDir of modelDirs) {
        if (!modelDir.isDirectory()) continue;

        const jsonPath = path.join(answersBase, modelDir.name, 'answer.json');
        const mdPath = path.join(answersBase, modelDir.name, 'answer.md');

        if (await answerJsonExists(jsonPath)) {
          tasks.push({
            question,
            modelId: modelDir.name,
            jsonPath,
            mdPath
          });
        }
      }
    } catch (error) {
      // Directory might not exist, skip this question
      logger.debug(`Skipping ${question.folder}: ${error}`);
    }
  }

  if (tasks.length === 0) {
    logger.warn(`No answer.json files found for date ${targetDate}. Please run fetch-answers-ai first.`);
    return;
  }

  // Process all tasks
  const totalTasks = tasks.length;
  const useCompactProgress = process.env.AICW_VERBOSE !== 'true' && !process.env.CI;
  const tracker = new ProgressTracker(totalTasks, 'transformations', useCompactProgress);

  let startMessage = `Transforming ${totalTasks} answer.json files to enhanced answer.md for project "${project}" on ${targetDate}`;
  if (force) {
    startMessage += ' (FORCE mode)';
  }
  tracker.start(startMessage);

  const fileLogger = logger.getFileLogger();
  if (fileLogger) {
    tracker.setFileLogger(fileLogger);
  }

  let successCount = 0;
  let skipCount = 0;
  let failureCount = 0;
  let operationCount = 0;

  for (const task of tasks) {
    operationCount++;

    const result = await transformSingleAnswer(task.jsonPath, task.mdPath, force);

    if (result.success) {
      successCount++;
      const sizeStr = result.size ? `${Math.round(result.size / 1024)}KB` : '';
      tracker.update(
        operationCount,
        `${colorize(task.question.folder, 'dim')} / ${colorize(task.modelId, 'cyan')} - ${colorize('Transformed', 'green')} (${sizeStr})`
      );
    } else if (result.reason === 'Already exists') {
      skipCount++;
      const sizeStr = result.size ? `${Math.round(result.size / 1024)}KB` : '';
      tracker.update(
        operationCount,
        `${colorize(task.question.folder, 'dim')} / ${colorize(task.modelId, 'cyan')} - ${colorize('Skipped', 'dim')} (${sizeStr})`
      );
    } else {
      failureCount++;
      tracker.update(
        operationCount,
        `${colorize(task.question.folder, 'dim')} / ${colorize(task.modelId, 'cyan')} - ${colorize(`Failed: ${result.reason}`, 'red')}`
      );
    }
  }

  const summary = `Transformed ${successCount} answers, skipped ${skipCount} existing, ${failureCount} failed`;
  tracker.complete(summary);

  if (skipCount > 0 && force) {
    logger.info(`ℹ️  Note: By default, ALL answer.md files are regenerated. Use --no-force to skip existing files.`);
  }

  if (failureCount > 0) {
    logger.warn(`⚠️  ${failureCount} transformations failed. Check the log for details.`);
  }

  // Show summary at the end
  await logger.showSummary();

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  if (err instanceof PipelineCriticalError) {
    logger.error(`\n❌ Pipeline Error in ${err.stepName}:`);
    logger.error(err.message);
    process.exit(1);
  } else {
    logger.error(err.message || err.toString());
    process.exit(1);
  }
});
