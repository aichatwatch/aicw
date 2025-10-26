import { promises as fs } from 'fs';
import { DirentLike } from '../config/types.js';
import path from 'path';
import { generateAggregateReport } from '../utils/report-aggregation.js';
import { generateAnswersFile } from './report-generate-answers-file.js';
import { REPORT_HTML_TEMPLATE_DIR, QUESTIONS_DIR, REPORT_DIR, OUTPUT_DIR, PROJECT_REPORTS_DIR, REPORTS_BY_DATE_DIR, QUESTION_DATA_COMPILED_DATE_DIR, QUESTION_DATA_COMPILED_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { writeFileAtomic, drawBox, colorize, waitForEnterInInteractiveMode, replaceMacrosInTemplate } from '../utils/misc-utils.js';
import { logger } from '../utils/compact-logger.js';
import { generateProjectNavigation } from '../utils/report-projects-navigation-generator.js';
import { ReportFileManager } from '../utils/report-file-manager.js';
import { getProjectNameFromCommandLine, getTargetDateFromProjectOrEnvironment, validateAndLoadProject } from '../utils/project-utils.js';
import { getUserProjectQuestionFileContent, getCurrentDateTimeAsStringISO } from '../config/user-paths.js';
import { createMissingFileError, MissingConfigError, PipelineCriticalError } from '../utils/pipeline-errors.js';
import { ModelType } from '../utils/project-utils.js';
import { getCurrentVersion } from '../utils/update-checker.js';

// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
import { ENTITIES_CONFIG } from '../config/constants-entities.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);


// Export wrapper function for programmatic use
export async function reportGenerate(project: string): Promise<void> {
  await main(project);
}

async function main(projectArg?: string): Promise<void> {
  const project = await getProjectNameFromCommandLine();
  await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);  
  
  await logger.initialize(import.meta.url, project);
  logger.info(`Generating reports for project: ${project}, date: ${targetDate}`);

  const baseQ: string = QUESTIONS_DIR(project);
  const outputBase: string = OUTPUT_DIR(project, targetDate);

  const questionDirs: DirentLike[] = await fs.readdir(baseQ, { withFileTypes: true }) as DirentLike[];

  // Filter to get only actual question directories
  const actualQuestionsDirs = questionDirs.filter(d => d.isDirectory() && d.name !== AGGREGATED_DIR_NAME);

  logger.startProgress(actualQuestionsDirs.length + 1, 'reports'); // +1 for aggregate report

  let enrichedFiles = 0;
  let processedQuestions = 0;
  let errorCount = 0;
  let dataNotFoundCount = 0;
  let currentIndex = 0;

  for (const dir of actualQuestionsDirs) {
    currentIndex++;
    logger.updateProgress(currentIndex, `Generating report for ${dir.name}...`);

    const questionId = dir.name;
    const compiledDir = QUESTION_DATA_COMPILED_DATE_DIR(project, questionId, targetDate);
    const outputDir = path.join(outputBase, questionId);
    const enrichedDataFile = path.join(compiledDir, `${targetDate}-data.js`);
    const questionContent = getUserProjectQuestionFileContent(project, questionId);

    // Prepare file manager for report operations
    const reportFileManager = new ReportFileManager({
      date: targetDate,
      outputDir,
      templateDir: REPORT_HTML_TEMPLATE_DIR
    });

    // Check if enriched data file exists
    const hasEnrichedData = await fs.access(enrichedDataFile).then(() => true).catch(() => false);

    if (!hasEnrichedData) {
      logger.warn(`No enriched data found for ${project} for date ${targetDate}`);
      throw new PipelineCriticalError(
        `No enriched data found for ${project} for date ${targetDate}`, 
        CURRENT_MODULE_NAME,
        project
      );
    }

    // Check if report already exists
    const outputHtmlFile = path.join(outputDir, 'index.html');
    const reportExists = await fs.access(outputHtmlFile).then(() => true).catch(() => false);

    try {
      // Create output directory if it doesn't exist
      await fs.mkdir(outputDir, { recursive: true });

      // Read and process the template index.html
      await reportFileManager.writeReportFiles(
        [
          {
            "filename": "index.html",
            "replacements": {
              "{{REPORT_DATE}}": targetDate,
              "{{REPORT_DATE_WITHOUT_DASHES}}": targetDate.replace(/-/g, ''),
              "{{PROJECT_NAME}": project,
              "{{REPORT_CREATED_AT_DATETIME}}": getCurrentDateTimeAsStringISO(),
              "{{REPORT_TITLE}}": questionContent,
              "{{REPORT_ENGINE_VERSION}}": getCurrentVersion()
            }
          },
          {
            "filename": "app.js",
              "replacements": {
                "{{ENTITIES_CONFIG_JSON}}": JSON.stringify(ENTITIES_CONFIG)
              }
          }
        ]        
      );

      // Write data-static.js file
      await reportFileManager.writeDataStaticFile();

      // Copy the enriched data file to output directory
      const outputDataFile = path.join(outputDir, `${targetDate}-data.js`);
      await fs.copyFile(enrichedDataFile, outputDataFile);

      // Copy answers file if it exists
      const answersFile = path.join(compiledDir, `${targetDate}-answers.js`);
      try{
        await fs.access(answersFile);
      }
      catch(err){
        createMissingFileError( 
          dir.name,
          answersFile,
          CURRENT_MODULE_NAME
        )
      }

      const outputAnswersFile = path.join(outputDir, `${targetDate}-answers.js`);
      await fs.copyFile(answersFile, outputAnswersFile);
      logger.debug(`Copied answers file ${answersFile} to ${outputAnswersFile}`);

      // Report generation successful for this question

      enrichedFiles++;
      processedQuestions++;
      logger.updateProgress(currentIndex, `${dir.name} - ✓`);
    } catch (error) {
      logger.error(`Error generating report for ${dir.name}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  // Generate aggregate report
  currentIndex++;
  logger.updateProgress(currentIndex, `Generating aggregate report...`);

  try {
    await generateAggregateReport(project, targetDate);
    logger.updateProgress(currentIndex, `Aggregate report - ✓`);
  } catch (error) {
    logger.error(`Error generating aggregate report: ${error instanceof Error ? error.message : String(error)}`);
    errorCount++;
  }

  logger.completeProgress('Report generation complete');

  logger.info(`\nReport generation complete:`);
  logger.info(`  Processed: ${processedQuestions} questions`);
  if (dataNotFoundCount > 0) logger.warn(`  No data found: ${dataNotFoundCount} questions`);
  if (errorCount > 0) logger.error(`  Errors: ${errorCount} questions`);

  await logger.showSummary();

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
