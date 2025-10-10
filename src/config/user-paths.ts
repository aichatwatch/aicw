import path, { dirname } from 'path';
import { homedir, platform } from 'os';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import pkg from 'fs-extra';
const { copySync } = pkg;
import { AGGREGATED_DIR_NAME } from './constants.js';
import { CompactLogger } from '../utils/compact-logger.js';
const logger = CompactLogger.getInstance();

// Define __dirname for ES modules FIRST - needed by getPackageRoot()
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// default other link type short name
export const DEFAULT_OTHER_LINK_TYPE_SHORT_NAME = 'oth';
export const DEFAULT_OTHER_LINK_TYPE_LONG_NAME = 'Other';

const DEFAULT_AICW_USER_NAME = 'default-user';

// User data directory (delegate to user-paths for consistency)
// User data subdirectories
export const USER_DATA_DIR = getUserDataDir();
export const USER_PROJECTS_DIR = path.join(USER_DATA_DIR, 'projects');
export const USER_REPORTS_DIR = path.join(USER_DATA_DIR, 'reports');
export const USER_CACHE_DIR = path.join(USER_DATA_DIR, 'cache');
export const USER_CONFIG_DIR = path.join(USER_DATA_DIR, 'config');
export const USER_CONFIG_CREDENTIALS_DIR = path.join(USER_CONFIG_DIR, '.credentials');
export const USER_CONFIG_CREDENTIALS_FILE = path.join(USER_CONFIG_CREDENTIALS_DIR, 'credentials.json');
export const USER_LOGS_DIR = path.join(USER_DATA_DIR, 'logs');
export const USER_INVALID_OUTPUTS_DIR = path.join(USER_LOGS_DIR, 'invalid');

export const USER_CONFIG_PROMPTS_DIR: string = path.join(USER_CONFIG_DIR, 'prompts');
export const USER_CONFIG_TEMPLATES_DIR = path.join(USER_CONFIG_DIR, 'templates')
const USER_MODELS_DIR: string = path.join(USER_CONFIG_DIR, 'models');
// ai models and ai presets
export const USER_MODELS_JSON_FILE: string = path.join(USER_MODELS_DIR, 'ai_models.json');
export const USER_AI_PRESETS_DIR: string = path.join(USER_MODELS_DIR, 'ai_presets');
// questions templates
export const USER_QUESTION_TEMPLATES_DIR: string = path.join(USER_CONFIG_TEMPLATES_DIR, 'questions');


export const DEFAULT_INDEX_FILE = 'index.html';

const QUESTION_FILE_NAME = 'question.md';
const QUESTIONS_FILE_NAME = 'questions.md';

/**
 * User data path management for aicw
 * Centralizes all user-specific data storage locations
 */

// Get the base user data directory based on platform
export function getUserDataDir(): string {
  const homeDir = homedir();
  const plat = platform();

  let outputPath = null;
  const userSubfolder = path.join('aicw', process.env.AICW_USER_NAME || DEFAULT_AICW_USER_NAME) + '/data';
  // so folder is like "/Users/USERNAME/Library/Application Support/aicw/default-user/data/"


  switch (plat) {
    case 'win32':
      // Windows: Use %APPDATA%/{userSubfolder} or fallback to home directory
      outputPath = process.env.APPDATA 
        ? path.join(process.env.APPDATA, userSubfolder)
        : path.join(homeDir, 'AppData', 'Roaming', userSubfolder);
      break;

    case 'darwin':
      // macOS: Use ~/Library/Application Support/{userSubfolder}
      outputPath = path.join(homeDir, 'Library', 'Application Support', userSubfolder);
      break;
    
    default:
      // Linux and others: Use ~/.config/{userSubfolder} (XDG Base Directory)
      outputPath = process.env.XDG_CONFIG_HOME 
        ? path.join(process.env.XDG_CONFIG_HOME, userSubfolder)
        : path.join(homeDir, '.config', userSubfolder);
      break;
  }

  if (process.env.AICW_DEV_MODE === 'true') {
    console.log(`AICW_DEV_MODE is true, user path: ${outputPath}`);
  }

 if(outputPath === null) {
  throw new Error('Output path for user data is null');
  process.exit(1);
 }

  return outputPath;
}

export function getCurrentDateTimeAsStringISO(): string {
  return new Date().toISOString();
}

// returns current datetime as string in format "2025 Oct 04 12:01:01"
export function getCurrentDateTimeAsString(): string {
  return new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
}



// Project-specific paths
export function getUserProjectDir(projectName: string): string {
  return path.join(USER_PROJECTS_DIR, projectName);
}

export function getUserProjectQuestionsFile(projectName: string): string {
  return path.join(getUserProjectDir(projectName), QUESTIONS_FILE_NAME);
}

export function getUserProjectConfigFile(projectName: string): string {
  return path.join(getUserProjectDir(projectName), 'project.json');
}

export function getUserProjectAnswersDirForQuestion(projectName: string, question: string): string {
  return path.join(getUserProjectQuestionsDir(projectName), question, 'answers');
}

export function getUserProjectQuestionsDir(projectName: string): string {
  return path.join(getUserProjectDir(projectName), 'questions');
}

export function getUserProjectQuestionFilePath(projectName: string, questionId: string): string {
  return path.join(getUserProjectQuestionsDir(projectName), questionId, QUESTION_FILE_NAME);
}

export function getUserProjectQuestionFileContent(projectName: string, questionId: string): string {
  return readFileSync(getUserProjectQuestionFilePath(projectName, questionId), 'utf-8');
}

export function getUserProjectReportsDir(projectName: string): string {
  return path.join(getUserProjectDir(projectName), 'reports');
}

export function getUserProjectOutputDir(projectName: string, date: string): string {
  return path.join(USER_REPORTS_DIR, 'projects', projectName, date);
}

// Question-specific paths
export function getUserQuestionDir(projectName: string, questionId: string): string {
  return path.join(getUserProjectQuestionsDir(projectName), questionId);
}

export function getUserQuestionDataCompiledDir(projectName: string, questionId: string): string {
  return path.join(getUserQuestionDir(projectName, questionId), 'data-compiled');
}

export function getUserQuestionDataCompiledDateDir(projectName: string, questionId: string, date: string): string {
  return path.join(getUserQuestionDataCompiledDir(projectName, questionId), date);
}

export function getUserAggregatedDataDir(projectName: string): string {
  return path.join(getUserProjectDir(projectName), AGGREGATED_DIR_NAME);
}

export function getUserAggregatedDataCompiledDir(projectName: string): string {
  return path.join(getUserAggregatedDataDir(projectName), 'data-compiled');
}

export function getUserAggregatedDataCompiledDateDir(projectName: string, date: string): string {
  return path.join(getUserAggregatedDataCompiledDir(projectName), date);
}

// Helper functions for displaying paths to users
export function getProjectDisplayPath(projectName: string): string {
  const fullPath = getUserProjectDir(projectName);
  const home = homedir();
  // Contract home directory to ~ for display
  return fullPath.startsWith(home) 
    ? fullPath.replace(home, '~') 
    : fullPath;
}

export function getReportsDisplayPath(projectName: string): string {
  // Get the base OUTPUT directory (without date)
  const reportsPath = path.join(USER_REPORTS_DIR, 'projects', projectName);
  const home = homedir();
  return reportsPath.startsWith(home)
    ? reportsPath.replace(home, '~')
    : reportsPath;
}

export function getActualReportsPath(projectName: string): string {
  // Get the actual full path for OUTPUT directory
  return path.join(USER_REPORTS_DIR, 'projects', projectName);
}

// Initialize user directories (creates them if they don't exist)
export function initializeUserDirectories(): void {

  logger.info(`Initializing user data directories...`);
  // project and reports directories
  const directories = [
    USER_DATA_DIR,
    USER_PROJECTS_DIR,
    USER_REPORTS_DIR,
    USER_CACHE_DIR,
    USER_LOGS_DIR,
    USER_INVALID_OUTPUTS_DIR,
    path.join(USER_REPORTS_DIR, 'projects'),
    USER_CONFIG_CREDENTIALS_DIR  // for encrypted credentials
  ];

  for (const dir of directories) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  // copy default data to user folder
  copyDefaultDataToUserConfig();
}

export function copyDefaultDataToUserConfig(): void {
  logger.info(`Copying default config files to user config directory...`);
  // Add safety check
  if (!existsSync(DEFAULT_DATA_FOR_USER_DATA_DIR)) {
    const msg = `Default config directory not found: ${DEFAULT_DATA_FOR_USER_DATA_DIR}`;
    logger.error(msg);
    throw new Error(msg);
  }  
  copyDirRecursive(DEFAULT_DATA_FOR_USER_DATA_DIR, USER_CONFIG_DIR);
}

function copyDirRecursive(src: string, dest: string): void {
  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
      }
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      if (!existsSync(destPath)) {
        copySync(srcPath, destPath);
      }
    }
  }
}

export function checkIfUserConfigFolderHasAllRequiredDataFiles(): boolean {
  const missingFiles: string[] = [];
  checkDirRecursive(DEFAULT_DATA_FOR_USER_DATA_DIR, USER_CONFIG_DIR, missingFiles);

  if (missingFiles.length > 0) {
    logger.warn(`Missing required user config files: \n${missingFiles.join('\n')}`);
    return false;
  }

  return true;
}

function checkDirRecursive(srcDir: string, destDir: string, missingFiles: string[]): void {
  const entries = readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      checkDirRecursive(srcPath, destPath, missingFiles);
    } else if (entry.isFile()) {
      if (!existsSync(destPath)) {
        missingFiles.push(path.relative(USER_CONFIG_DIR, destPath));
      }
    }
  }
}

// Check if running in development mode (has src directory)
export function isDevMode(): boolean {
  // Check if we're running from source (has src directory as sibling to dist)
  const srcDir = path.join(__dirname, '..', 'src');
  return existsSync(srcDir);
}

// Get package root directory (for accessing bundled resources)
export function getPackageRoot(): string {
  // In dev: /Users/.../aicw/dist/config -> /Users/.../aicw
  // In npm: /usr/local/lib/node_modules/aicw/dist/config -> /usr/local/lib/node_modules/aicw
  return path.join(__dirname, '..', '..');
}

export function getProjectNameFromProjectFolder(project: string): string {
  return project.replace(/_/g, ' ').trim();
}

// Get source templates directory (from package)
export function getPackageTemplatesDir(): string {
  const root = getPackageRoot();
  // Try src first (dev mode), then fallback to bundled location
  const srcTemplates = path.join(root, 'src', 'config', 'templates');
  const distTemplates = path.join(root, 'config', 'templates');

  if (existsSync(srcTemplates)) {
    return srcTemplates;
  } else if (existsSync(distTemplates)) {
    return distTemplates;
  }

  // Fallback to expected location
  return srcTemplates;
}

// Get source config directory (from package)
export function getPackageConfigDir(subFolder: string = ''): string {
  const root = getPackageRoot();
  // Try src first (dev mode), then fallback to bundled location
  const srcConfig = path.join(root, 'src', subFolder, 'config');
  const distConfig = path.join(root, subFolder, 'config');

  if (existsSync(srcConfig)) {
    return srcConfig;
  } else if (existsSync(distConfig)) {
    return distConfig;
  }
  // Fallback to expected location
  return srcConfig;
}

// Default data directory for user config files (defined here to avoid circular dependency)
const DEFAULT_DATA_FOR_USER_DATA_DIR = path.join(getPackageConfigDir(), 'default');

