import path, { dirname } from 'path';
import { homedir, platform } from 'os';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { copySync } from 'fs-extra';
import { AGGREGATED_DIR_NAME } from './constants.js';
import { CompactLogger } from '../utils/compact-logger.js';
import { DEFAULT_DATA_FOR_USER_DATA_DIR } from './paths.js';
const logger = CompactLogger.getInstance();

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
export const USER_LOGS_DIR = path.join(USER_DATA_DIR, 'logs');
export const USER_INVALID_OUTPUTS_DIR = path.join(USER_LOGS_DIR, 'invalid');

export const DEFAULT_INDEX_FILE = 'index.html';

const QUESTION_FILE_NAME = 'question.md';
const QUESTIONS_FILE_NAME = 'questions.md';

/**
 * User data path management for aicw
 * Centralizes all user-specific data storage locations
 */

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    path.join(USER_REPORTS_DIR),
    path.join(USER_REPORTS_DIR, 'projects')
  ];
  
  for (const dir of directories) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    else {
      logger.info(`Folder ${dir} already exists, skipping creation.`);
    }
  }
  // copy default data to user folder
  copyDefaultDataToUserConfig();
}

export function copyDefaultDataToUserConfig(): void {
    // now get folders from config/default
  // by scanning for all subfodlers
  // Synchronously read all subfolders in DEFAULT_DATA_FOR_USER_DATA_DIR
  const defaultDataFoldersInConfigDefault = readdirSync(DEFAULT_DATA_FOR_USER_DATA_DIR, { withFileTypes: true })
    .filter(f => f.isDirectory())
    .map(f => f.name);
  // now copy all folders from config/default to user config directory
  for (const folder of defaultDataFoldersInConfigDefault) {
    const srcFolder = path.join(DEFAULT_DATA_FOR_USER_DATA_DIR, folder);
    const destFolder = path.join(USER_CONFIG_DIR, folder);

    // Ensure destination folder exists
    if (!existsSync(destFolder)) {
      mkdirSync(destFolder, { recursive: true });
    }

    // Copy each file individually, only if it does not exist
    const files = readdirSync(srcFolder, { withFileTypes: true })
      .filter(f => f.isFile())
      .map(f => f.name);

    for (const file of files) {
      const srcFile = path.join(srcFolder, file);
      const destFile = path.join(destFolder, file);
      if (!existsSync(destFile)) {
        copySync(srcFile, destFile);
      } else {
        logger.warn(`File ${destFile} already exists. Skipping copy.`);
      }
    }
  }
}

export function checkIfUserConfigFolderHasAllRequiredDataFiles(): boolean {
  // Get all folders in config/default
  const defaultDataFolders = readdirSync(DEFAULT_DATA_FOR_USER_DATA_DIR, { withFileTypes: true })
    .filter(f => f.isDirectory())
    .map(f => f.name);

  const missingFiles: string[] = [];

  for (const folder of defaultDataFolders) {
    const srcFolder = path.join(DEFAULT_DATA_FOR_USER_DATA_DIR, folder);
    const destFolder = path.join(USER_CONFIG_DIR, folder);

    // Get all files in the default folder
    const files = readdirSync(srcFolder, { withFileTypes: true })
      .filter(f => f.isFile())
      .map(f => f.name);

    for (const file of files) {
      const destFile = path.join(destFolder, file);
      if (!existsSync(destFile)) {
        missingFiles.push(path.relative(USER_CONFIG_DIR, destFile));
      }
    }
  }

  if (missingFiles.length > 0) {
    logger.warn(`Missing required user config files: \n${missingFiles.join('\n')}\nRun setup again to fix this.`);
    return false;
  }

  // otherwise return true
  return true;
}

// Check if running in development mode (has src directory)
export function isDevMode(): boolean {
  // Check if we're running from source (has src directory as sibling to dist)
  const srcDir = path.join(__dirname, '..', 'src');
  return existsSync(srcDir);
}

// Get package root directory (for accessing bundled resources)
export function getPackageRoot(): string {
  // In dev: /Users/.../aicw/dist -> /Users/.../aicw
  // In npm: /usr/local/lib/node_modules/aicw/dist -> /usr/local/lib/node_modules/aicw
  return path.join(__dirname, '..');
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

