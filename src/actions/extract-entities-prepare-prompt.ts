import { promises as fs } from 'fs';
import { DirentLike } from '../config/types.js';
import path from 'path';
import { QuestionEntry } from '../config/types.js';
import { EXTRACT_ENTITIES_PROMPT_TEMPLATE_PATH, QUESTIONS_DIR, CAPTURE_DIR, REPORT_DIR, QUESTION_DATA_COMPILED_DATE_DIR, MIN_VALID_OUTPUT_DATA_SIZE } from '../config/paths.js';
import { logger } from '../utils/compact-logger.js';
import { replaceMacrosInTemplate, waitForEnterInInteractiveMode, writeFileAtomic } from '../utils/misc-utils.js';
import { isValidOutputFile } from '../utils/misc-utils.js';
import { getProjectNameFromCommandLine, getTargetDateFromProjectOrEnvironment, loadProjectModelConfigs, removeNonProjectModels, validateAndLoadProject } from '../utils/project-utils.js';
import { readQuestions } from '../utils/project-utils.js';
import { PipelineCriticalError } from '../utils/pipeline-errors.js';
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
import { ModelType } from '../utils/project-utils.js';
// get action name for the current module
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

async function getLatestDate(folder: string): Promise<string | undefined> {
  const dirs: DirentLike[] = await fs.readdir(folder, { withFileTypes: true }) as DirentLike[];
  const dates: string[] = dirs
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort()
    .reverse();
  return dates[0];
}

export async function extractEntitiesPreparePrompt(project: string, targetDate:  string): Promise<void> {
  const template: string = await fs.readFile(EXTRACT_ENTITIES_PROMPT_TEMPLATE_PATH, 'utf-8');
  const questions: QuestionEntry[] = await readQuestions(project);

  // Load project-specific models
  const projectModelsForAnswer = await loadProjectModelConfigs(project, ModelType.GET_ANSWER);

  // Start progress tracking
  logger.startProgress(questions.length, 'questions');
  
  if (!targetDate) {
    throw new Error('Target date is required');
  }

  let questionIndex = 0;
  let processedCount = 0;

  for (const q of questions) {
    questionIndex++;

    const answersBase: string = path.join(CAPTURE_DIR(project), q.folder, 'answers');

    // When a target date is specified, check if this question has answers for that specific date
    // Otherwise use the latest date for this question
    let answerDate: string | undefined;
    if (targetDate) {
      // Check if this question has answers for the target date
      const answerDir = path.join(answersBase, targetDate);
      try {
        const stats = await fs.stat(answerDir);
        if (stats.isDirectory()) {
          answerDate = targetDate;
        }
      } catch (error) {
        // Directory doesn't exist for this date
        answerDate = undefined;
      }
    } else {
      answerDate = await getLatestDate(answersBase);
    }

    if (!answerDate) {
      throw new PipelineCriticalError(
        `No answers found for ${q.folder} for date "${targetDate || 'any date'}'`, 
        CURRENT_MODULE_NAME, 
        project
      );
    }

    // Check if prompt already exists
    const compiledDir = QUESTION_DATA_COMPILED_DATE_DIR(project, q.folder, targetDate);
    const destFile = path.join(compiledDir, `${targetDate}-data.js.PROMPT.md`);

    // Update progress
    logger.updateProgress(questionIndex, `${q.folder} - Processing...`);

    const modelDirs = await removeNonProjectModels(
      await fs.readdir(path.join(answersBase, answerDate), { withFileTypes: true }),
      projectModelsForAnswer
    );

    let answersSection: string = '';

    for (const modelDir of modelDirs) {
      const bot = modelDir.name;
      const answerPath = path.join(answersBase, answerDate, bot, 'answer.md');
      try {
        const text = await fs.readFile(answerPath, 'utf-8');
        answersSection += `\n-------\n# ANSWER FROM FROM \`${bot}\`\n------\n\n${text}\n`;
      } catch (error) {
        // Skip if answer file doesn't exist
        logger.debug(`Skipping ${bot} - no answer file found`);
      }
    }

    // Use new folder structure: /questions/<question>/data-compiled/<date>/
    // Create the directory first before saving any files
    await fs.mkdir(compiledDir, { recursive: true });

    const filled = await replaceMacrosInTemplate(template, {
      '{{REPORT_QUESTION}}': q.question,
      '{{ANSWERS}}': answersSection
    });
    await writeFileAtomic(destFile, filled);
    processedCount++;

    // Update progress with completion status
    logger.updateProgress(questionIndex, `${q.folder} - ✓`);
    logger.debug(`Prompt built for ${q.folder}`);
  }

  // Complete progress and show summary
  logger.completeProgress(`Processed: ${processedCount}`);
  logger.info(`Build complete. Processed: ${processedCount} prompts`);

  await logger.showSummary();
}

async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
 await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);

  // Initialize logger
  await logger.initialize(import.meta.url, project);

  await extractEntitiesPreparePrompt(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
