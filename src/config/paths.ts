import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getUserProjectDir,
  getUserProjectQuestionsDir,
  getUserProjectReportsDir,
  getUserProjectOutputDir,
  getUserQuestionDataCompiledDir,
  getUserQuestionDataCompiledDateDir,
  getUserAggregatedDataCompiledDir,
  getUserAggregatedDataCompiledDateDir,
  getPackageRoot,
  getPackageConfigDir,
  getPackageTemplatesDir,
  isDevMode,
  USER_DATA_DIR,
  getUserProjectAnswersDirForQuestion,
} from './user-paths.js';


// Base directories
export const __dirname: string = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR: string = getPackageRoot();
// Config should always be read from package directory
export const CONFIG_DIR: string = getPackageConfigDir();


export const DATE_FOLDER_NAME_PATTERN_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const PROMPTS_DIR: string = path.join(CONFIG_DIR, 'prompts');
// Templates should be read from package directory
export const TEMPLATES_DIR: string = getPackageTemplatesDir();

// ---- USER DATA (copied from /config/default/* on setup)
export const USER_CONFIG_DIR: string = path.join(USER_DATA_DIR, 'config');
// source folder with default files for user 
export const DEFAULT_DATA_FOR_USER_DATA_DIR = path.join(CONFIG_DIR, 'default');
// using .credentials directory to hide the credentials file from the user
export const USER_CONFIG_CREDENTIALS_DIR: string = path.join(USER_CONFIG_DIR, '.credentials');
export const USER_CONFIG_CREDENTIALS_FILE: string = path.join(USER_CONFIG_CREDENTIALS_DIR, 'credentials.json');


export const REPORT_TEMPLATES_DIR: string = path.join(TEMPLATES_DIR, 'report');



export const ENRICH_GENERATE_SUMMARY_PROMPT_PATH: string = path.join(PROMPTS_DIR, 'enrich-generate-summary.md');
export const ENRICH_GENERATE_SUMMARY_AGGREGATE_PROMPT_PATH: string = path.join(PROMPTS_DIR, 'enrich-generate-summary-aggregate.md');

// Report template paths
export const EXTRACT_ENTITIES_PROMPT_TEMPLATE_PATH: string = path.join(PROMPTS_DIR, 'extract-entities.md');
export const SINGLE_ANSWER_TEMPLATE_PATH: string = path.join(PROMPTS_DIR, 'shared', 'single-answer.md');
export const REPORT_HTML_TEMPLATE_DIR: string = path.join(REPORT_TEMPLATES_DIR, 'html', 'projects', 'project', 'question');

// Standard data file patterns
export const DATA_FILE_PATTERN = (date: string): string => `${date}-data.js`;
export const PROMPT_FILE_PATTERN = (date: string): string => `${date}-data.js.PROMPT.md`;
export const BACKUP_DIR_NAME = 'backups';
export const BACKUP_FILE_PATTERN = (stepName: string, filename: string): string =>
  `${stepName}_${filename}`;

// Project-specific path generators (use user paths)
export const PROJECT_DIR = (project: string): string => getUserProjectDir(project);
export const QUESTIONS_DIR = (project: string): string => getUserProjectQuestionsDir(project);
export const GET_ANSWERS_DIR_FOR_QUESTION = (project: string, question: string): string => getUserProjectAnswersDirForQuestion(project, question);  
export const CAPTURE_DIR = (project: string): string => getUserProjectQuestionsDir(project);
export const REPORT_DIR = (project: string): string => getUserProjectReportsDir(project);
export const OUTPUT_DIR = (project: string, date: string): string => getUserProjectOutputDir(project, date);
export const PROJECT_REPORTS_DIR = (project: string, date: string): string => path.join(getUserProjectReportsDir(project), date);
export const REPORTS_BY_DATE_DIR = (date: string): string => path.join(USER_DATA_DIR, 'reports', date);

// New path generators for compiled data storage (use user paths)
// For individual questions: /projects/<project>/questions/<question-id>/data-compiled/<date>/
export const QUESTION_DATA_COMPILED_DIR = (project: string, question: string): string => 
  getUserQuestionDataCompiledDir(project, question);
export const QUESTION_DATA_COMPILED_DATE_DIR = (project: string, question: string, date: string): string => 
  getUserQuestionDataCompiledDateDir(project, question, date);

// For aggregated data: /projects/<project>/_all-questions-combined/data-compiled/<date>/
export const AGGREGATED_DATA_COMPILED_DIR = (project: string): string => 
  getUserAggregatedDataCompiledDir(project);
export const AGGREGATED_DATA_COMPILED_DATE_DIR = (project: string, date: string): string => 
  getUserAggregatedDataCompiledDateDir(project, date);

// File size constraints
export const MIN_VALID_ANSWER_SIZE = 200; // Minimum size in bytes for a valid answer
export const MIN_VALID_OUTPUT_DATA_SIZE = 200; // Minimum size in bytes for PROMPT.md, COMPILED.js, data.js files

// Retry configuration
export const RETRY_CONFIG = {
  /** Maximum number of retry attempts for 5xx and 429 errors */
  MAX_RETRIES: 12 as number,
  /** Initial delay in milliseconds before first retry (5 seconds for 429 errors) */
  INITIAL_DELAY_MS: 5000 as number,
  /** Maximum delay in milliseconds between retries */
  MAX_DELAY_MS: 60000 as number,
  /** Backoff multiplier (e.g., 2 = double the delay after each retry) */
  BACKOFF_MULTIPLIER: 2 as number
};