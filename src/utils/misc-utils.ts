import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { isDevMode } from '../config/user-paths.js';
import { decryptCredentialsFile, isEncryptedCredentials } from './crypto-utils.js';
import { output } from './output-manager.js';
import { MIN_VALID_OUTPUT_DATA_SIZE, USER_CONFIG_CREDENTIALS_FILE } from '../config/paths.js';
import { PipelineCriticalError } from './pipeline-errors.js';
import { CompactLogger } from './compact-logger.js';
const logger = CompactLogger.getInstance();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

const MAX_TEMPLATE_PREVIEW_LENGTH_FOR_ERROR_MESSAGES = 400;

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};


export function getModuleNameFromUrl(url: string): string {
  return url.match(/\/([^/]+)\.(js|ts)$/)?.[1] || 'default';
}

export function colorize(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

export interface BoxOptions {
  borderColor?: keyof typeof COLORS;
  padding?: number;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export function drawBox(lines: string[], options: BoxOptions = {}): string {
  const {
    borderColor = 'green',
    padding = 1,
    width,
    align = 'center'
  } = options;

  // Find the longest line to determine border width
  let maxLength = 0;
  for (const line of lines) {
    const strippedLine = line.replace(/\x1b\[[0-9;]*m/g, ''); // Remove ANSI codes for length calculation
    if (strippedLine.length > maxLength) {
      maxLength = strippedLine.length;
    }
  }

  // Use specified width or auto-size to longest line
  const borderWidth = width || Math.max(maxLength, 30); // Minimum 30 chars
  const border = colorize('═', borderColor);
  const borderLine = border.repeat(borderWidth);

  const result: string[] = [];

  // Add top border
  result.push(borderLine);

  // Add top padding (empty lines)
  for (let i = 0; i < padding; i++) {
    result.push('');
  }

  // Add content lines - just display them as-is, optionally with alignment
  for (const line of lines) {
    if (align === 'center') {
      const strippedLine = line.replace(/\x1b\[[0-9;]*m/g, '');
      const lineLength = strippedLine.length;
      if (lineLength < borderWidth) {
        const leftPadding = Math.floor((borderWidth - lineLength) / 2);
        result.push(' '.repeat(leftPadding) + line);
      } else {
        result.push(line);
      }
    } else if (align === 'right') {
      const strippedLine = line.replace(/\x1b\[[0-9;]*m/g, '');
      const lineLength = strippedLine.length;
      if (lineLength < borderWidth) {
        const leftPadding = borderWidth - lineLength;
        result.push(' '.repeat(leftPadding) + line);
      } else {
        result.push(line);
      }
    } else {
      // Default: left align or as-is
      result.push(line);
    }
  }

  // Add bottom padding (empty lines)
  for (let i = 0; i < padding; i++) {
    result.push('');
  }

  // Add bottom border
  result.push(borderLine);

  return result.join('\n');
}

// formatLine function removed - no longer needed with the simplified box design

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}


// Load encrypted API keys from user config directory
export async function loadEnvFile(): Promise<void> {
  try {
    const credentialsPath = USER_CONFIG_CREDENTIALS_FILE;
    const credContent = await fs.readFile(credentialsPath, 'utf8');
    const credData = JSON.parse(credContent);

    if (isEncryptedCredentials(credData)) {
      // Decrypt and load API keys
      const decrypted = decryptCredentialsFile(credData);
      for (const [key, value] of Object.entries(decrypted)) {
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch {
    // No credentials file found - user needs to run setup
    logger.warn(`No credentials file found - user needs to run setup`);
  }
}

export async function replaceMacrosInTemplate(
  template: string,
  macrosAndValues: Record<string, string>,
  verify: boolean = true
) {

  if (!template || template.trim() === '') {
    throw new PipelineCriticalError(
      `Template is empty`,
      'replaceMacrosInTemplate',
      'verifyTemplateHasNoMacrosInside'
    );
  }

  // go through all macros and values and replace them in the template
  for (const [macro, value] of Object.entries(macrosAndValues)) {

    if(!macro || macro.trim() === '') {
      throw new PipelineCriticalError(
        `Macro is empty`,
        'replaceMacrosInTemplate',
        'verifyTemplateHasNoMacrosInside'
      );
    }


    if(!value || typeof value !== 'string' || value.trim() === '') {
      throw new PipelineCriticalError(
        `Value for macro '${macro}' is empty or not a string: "${JSON.stringify(value)}" (type: ${typeof value})`,
        'replaceMacrosInTemplate',
        'verifyTemplateHasNoMacrosInside'
      );
    }

      const templateBefore = template;
      template = template.replaceAll(macro, value);      
      if(verify && template === templateBefore) {
        throw new PipelineCriticalError(
          `Macro ${macro} was NOT replaced in template! templateBefore:\n\n${templateBefore.trim().substring(0, MAX_TEMPLATE_PREVIEW_LENGTH_FOR_ERROR_MESSAGES)}...\n\n`,
          'replaceMacrosInTemplate',
          'verifyTemplateHasNoMacrosInside'
        );
      }
  }

  // verify again ANY {{..}} unreplaced macros if need to!
  if(verify) {
    await verifyTemplateHasUnreplacedMustachioMacrosInside(template);
  }

  return template;
}

async function verifyTemplateHasUnreplacedMustachioMacrosInside(prompt:string){
  if (!prompt) {
    return;
  }
  if(prompt.indexOf('{{') === -1 && prompt.indexOf('}}') === -1)  {
    return;
  }

  // gather macros that were not replaced!
  const REGEX_MACROS = /{{[A-Z0-9_]+}}/g;
  const macros = prompt.match(REGEX_MACROS);

  throw new PipelineCriticalError(
    `!! Input string has macros that are not replaced:\n\n${macros.join('\n')}\n. Template was:\n\n${prompt.trim().substring(0, MAX_TEMPLATE_PREVIEW_LENGTH_FOR_ERROR_MESSAGES)}...`, 
    'verifyTemplateHasUnreplacedMustachioMacrosInside'
  );
}

/**
 * Atomically write data to a file by writing to a temp file first and then renaming.
 * This prevents partial writes and data corruption if the process crashes during write.
 *
 * In dev mode (npm link, running from source), automatically creates a backup of existing files
 * before overwriting them. Backups are named: BACKUP-{ISO-timestamp}-{original-filename}
 *
 * @param filePath - The destination file path
 * @param data - The data to write (string or Buffer)
 * @param options - Optional encoding (defaults to 'utf8')
 * @returns Promise that resolves when write is complete
 */
export async function writeFileAtomic(
  filePath: string,
  data: string | Buffer,
  options: { encoding?: BufferEncoding; mode?: number } = {}
): Promise<void> {
  const { encoding = 'utf8', mode } = options;

  // Generate a unique temp file name in the same directory as the target file
  const dir = dirname(filePath);
  const tempFileName = `.${randomBytes(16).toString('hex')}.tmp`;
  const tempPath = join(dir, tempFileName);

  try {
    // Ensure the directory exists
    await fs.mkdir(dir, { recursive: true });

    // In dev mode, create backup of existing file before overwriting
    if (isDevMode()) {
      try {
        await fs.access(filePath);
        // File exists, create backup
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
        const backupName = `BACKUP-${timestamp}-${fileName}`;
        const backupPath = join(dir, backupName);
        await fs.copyFile(filePath, backupPath);
      } catch {
        // File doesn't exist yet, no backup needed
        logger.info(`File ${filePath} does not exist yet, no backup needed`);
      }
    }

    // Write to temp file
    await fs.writeFile(tempPath, data, encoding);

    // Set file permissions if specified
    if (mode !== undefined) {
      await fs.chmod(tempPath, mode);
    }

    // Atomically rename temp file to final destination
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Check if a file or folder entry is a backup that should be preserved
 *
 * @param entryName - Name of the file or directory entry
 * @param isDirectory - Whether this entry is a directory
 * @returns true if this is a backup entry and should be skipped during cleanup
 */
export function isBackupFileOrFolder(entryName: string, isDirectory: boolean): boolean {
  // Skip backups directory
  if (isDirectory && entryName === 'backups') {
    return true;
  }

  // Skip BACKUP- prefixed files (created by writeFileAtomic in dev mode)
  if (!isDirectory && entryName.startsWith('BACKUP-')) {
    return true;
  }

  return false;
}

// Function to wait for Enter key in interactive mode
export async function waitForEnterInInteractiveMode(): Promise<void> {
  // Only show prompt if running from interactive mode AND not part of a pipeline
  // When running as part of a pipeline, we want to continue to the next step automatically
  if (process.env.AICW_INTERACTIVE_MODE === 'true' && !process.env.AICW_PIPELINE_STEP) {
    output.writeLine(colorize('\nPRESS ENTER TO RETURN TO THE MENU', 'dim'));

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise<void>(resolve => {
      rl.question('', () => {
        rl.close();
        resolve();
      });
    });
  }
}

/**
 * Check if an output file exists and meets minimum size requirements.
 * In force mode, deletes the file first to ensure rebuild.
 * @param filePath - Path to the file to check
 * @param minSize - Minimum required file size in bytes
 * @param forceRebuild - If true, deletes the file and returns false
 * @returns true if file exists and meets size requirements, false otherwise
 */
export async function isValidOutputFile(
  filePath: string,
  minSize: number = MIN_VALID_OUTPUT_DATA_SIZE,
  forceRebuild: boolean = false
): Promise<boolean> {
  // In force mode, delete the file first so check fails naturally
  if (forceRebuild) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File doesn't exist, that's ok
    }
    return false; // Always rebuild in force mode
  }

  try {
    const stats = await fs.stat(filePath);
    return stats.size >= minSize;
  } catch (error) {
    return false; // File doesn't exist
  }
}
