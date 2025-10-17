import { promises as fs } from 'fs';
import path from 'path';
import { DirentLike, QuestionEntry } from '../config/types.js';
import { AGGREGATED_DATA_COMPILED_DIR, AGGREGATED_DATA_COMPILED_DATE_DIR, QUESTIONS_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { logger } from '../utils/compact-logger.js';
import { waitForEnterInInteractiveMode, isBackupFileOrFolder } from '../utils/misc-utils.js';
import { getProjectNameFromCommandLine, getTargetDateFromProjectOrEnvironment, validateAndLoadProject } from '../utils/project-utils.js';
import { readQuestions } from '../utils/project-utils.js';
import { PipelineCriticalError } from '../utils/pipeline-errors.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

// testing if the path is a valid date like 2025-01-02
const DATE_TEST_REGEX = /^\d{4}-\d{2}-\d{2}$/;

async function cleanWithCaution(project: string, targetDate: string, targetPath: string, dateFromPath: string)
{
  const { validatePathIsSafe } = await import('../utils/misc-utils.js');

  // SECURITY: Validate path is safe and inside USER_DATA_DIR before ANY deletion
  await validatePathIsSafe(targetPath, `compiled data cleanup for project: ${project}, date: ${dateFromPath}`);

  // INVERTED LOGIC: Clean ONLY the target date, preserve all others
  if (dateFromPath !== targetDate) {
    logger.debug(`Preserving historical date: ${dateFromPath}`);
    return;
  }

  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip all backup files and folders
      if (isBackupFileOrFolder(entry.name, entry.isDirectory())) {
        logger.debug(`Preserving backup: ${entry.name}`);
        continue;
      }

      // Only delete files (not directories)
      if (entry.isFile()) {
        const entryPath = path.join(targetPath, entry.name);  

        await fs.unlink(entryPath);
        logger.debug(`Deleted: ${entry.name}`);
      }
    }
  } catch (error) {
    throw new PipelineCriticalError(
      `Could not clean ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
      CURRENT_MODULE_NAME,
      project
    );
  }
}

async function cleanupCompiledData(project: string, targetDate: string)
{
  const questions = await readQuestions(project); 

  // Start progress tracking
  logger.startProgress(questions.length, 'questions');

  let totalFoldersDeleted = 0;
  let totalBytesFreed = 0;

  for (const [index, question] of questions.entries()) {
    const currentIndex = index + 1;
    logger.updateProgress(currentIndex, `Cleaning ${question.folder}...`);

    // Path to data-compiled directory for this question
    const dataCompiledDir = path.join(QUESTIONS_DIR(project), question.folder, 'data-compiled');

    try {
      // Check if data-compiled directory exists
      await fs.access(dataCompiledDir);
    } catch {
      // No data-compiled directory - nothing to clean
      logger.debug(`No data-compiled directory for ${question.folder}`);
      logger.updateProgress(currentIndex, `${question.folder} - No data to clean`);
      continue;
    }

      const dateDirs = await fs.readdir(dataCompiledDir, { withFileTypes: true });

      for (const dateDir of dateDirs) {
        try{
          // Clean files INSIDE the target date folder (except backups)
          if (dateDir.isDirectory() && DATE_TEST_REGEX.test(dateDir.name)) {
            const targetDatePath = path.join(dataCompiledDir, dateDir.name);
            await cleanWithCaution(project, targetDate, targetDatePath, dateDir.name);
          }
        } catch (error) {
          throw new PipelineCriticalError(
            `Could not clean ${dateDir.name}: ${error instanceof Error ? error.message : String(error)}`,
            CURRENT_MODULE_NAME,
            project
          );
        }
      }
  }

  // also need to clean AGGREGATED_DIR_NAME
  logger.info(`Cleaning aggregated data compiled directory for date: ${targetDate}`);
  const aggregatedDateDir = AGGREGATED_DATA_COMPILED_DATE_DIR(project, targetDate);

  // Check if aggregated directory exists before trying to clean it
  try {
    await fs.access(aggregatedDateDir);
  } catch {
    // No aggregated directory - nothing to clean
    logger.debug(`No aggregated data-compiled directory for date ${targetDate}`);
    return;
  }

  await cleanWithCaution(project, targetDate, aggregatedDateDir, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
  // Initialize logger
  await logger.initialize(import.meta.url, project);

  await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);
  if(targetDate) {
    await cleanupCompiledData(project, targetDate);
  } else {
    logger.warn(`No answers for ANY date found for project ${project}, skipping cleanup of compiled data`);
  }

  await logger.showSummary(); 
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});

