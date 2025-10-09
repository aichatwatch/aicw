/**
 * CompactLogger wrapper for backward compatibility
 * Redirects all calls to the centralized OutputManager
 */

import { OutputManager, output } from './output-manager.js';
import { promises as fs } from 'fs';
import { dirname } from 'path';


export class CompactLoggerWrapper {
  private static instance: CompactLoggerWrapper | null = null;
  private outputManager: OutputManager = output;
  public currentActionName: string = 'unknown-action';
  protected constructor() {}

  static getInstance(): CompactLoggerWrapper {
    if (!CompactLoggerWrapper.instance) {
      CompactLoggerWrapper.instance = new CompactLoggerWrapper();
    }
    return CompactLoggerWrapper.instance;
  }

  async initialize(callerUrl: string, project?: string): Promise<void> {
    // init with default
    this.currentActionName = 'unknown-action';
    // get from meta url
    this.currentActionName = this.deriveActionNameFromUrl(callerUrl);             
    return this.outputManager.initialize(this.currentActionName, project);              
  }                                                                         
                                                                            
  private deriveActionNameFromUrl(url: string): string {                    
    // Extract filename from URL: file:///path/to/extract-links.js -> extract-links
    const match = url.match(/\/([^/]+)\.(js|ts)$/);                         
    if (match) {                                                            
      return match[1]; // Returns 'extract-links', 'report-generate', etc.  
    }                                                                       
    return 'unknown-action';                                                
  }

  setVerbosity(level: string): void {
    this.outputManager.setVerbosity(level);
  }

  setOperation(name: string): void {
    // This is now handled internally by OutputManager
  }

  // Progress tracking
  startProgress(total: number, itemType: string): void {
    this.outputManager.startProgress(total, itemType);
  }

  updateProgress(current: number, message: string): void {
    this.outputManager.updateProgress(current, message);
  }

  completeProgress(summary?: string): void {
    this.outputManager.completeProgress(summary);
  }

  // Logging methods
  debug(message: string): void {
    this.outputManager.debug(message);
  }

  info(message: string): void {
    this.outputManager.info(message);
  }

  log(message: string): void {
    this.outputManager.log(message);
  }

  warn(message: string): void {
    this.outputManager.warn(message);
  }

  warnImmediate(message: string): void {
    this.outputManager.warnImmediate(message);
  }

  error(message: string): void {
    this.outputManager.error(message);
  }

  success(message: string): void {
    this.outputManager.success(message);
  }

  // Statistics tracking
  addStat(key: string, value: any): void {
    this.outputManager.addStat(key, value);
  }

  incrementStat(key: string): void {
    this.outputManager.incrementStat(key);
  }

  getStat(key: string): any {
    return this.outputManager.getStat(key);
  }

  async showSummary(): Promise<void> {
    return this.outputManager.showSummary();
  }

  getLogFilePath(): string {
    // OutputManager doesn't expose this, return empty for now
    return '';
  }

  logDetail(fileMessage: string, consoleMessage?: string): void {
    if (consoleMessage) {
      this.outputManager.debug(consoleMessage);
    } else {
      this.outputManager.debug(fileMessage);
    }
  }

  getFileLogger(): any {
    // For compatibility, return null
    return null;
  }

  /**
   * Save invalid AI output for debugging
   * Creates three files: raw, cleaned, and metadata
   */
  async saveInvalidAIOutput(params: {
    rawOutput: string;
    cleanedOutput: string;
    step: string;
    project: string;
    questionId?: string;
    error: string;
    model?: string;
    promptFile?: string;
  }): Promise<string> {
    const { rawOutput, cleanedOutput, step, project, questionId, error, model, promptFile } = params;

    try {
      // Import path utilities
      const { USER_INVALID_OUTPUTS_DIR } = await import('../config/user-paths.js');
      const path = await import('path');
      const { writeFileAtomic } = await import('./misc-utils.js');

      // Create logs/invalid directory
      await fs.mkdir(USER_INVALID_OUTPUTS_DIR, { recursive: true });

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const questionPart = questionId ? `_${questionId}` : '';
      const baseName = `${step}_${project}${questionPart}_${timestamp}`;
      const basePath = path.join(USER_INVALID_OUTPUTS_DIR, baseName);

      // Save raw output
      await writeFileAtomic(`${basePath}.raw.txt`, rawOutput);

      // Save cleaned output
      await writeFileAtomic(`${basePath}.cleaned.txt`, cleanedOutput);

      // Save metadata
      const metadata = {
        timestamp: new Date().toISOString(),
        step,
        project,
        questionId: questionId || null,
        error,
        model: model || 'unknown',
        promptFile: promptFile || null,
        rawOutputLength: rawOutput.length,
        cleanedOutputLength: cleanedOutput.length,
        outputPreview: cleanedOutput.substring(0, 300).replace(/\n/g, '\\n')
      };
      await writeFileAtomic(`${basePath}.meta.json`, JSON.stringify(metadata, null, 2));

      this.warn(`Invalid AI output saved to: ${USER_INVALID_OUTPUTS_DIR}/`);
      this.warn(`Files: ${baseName}.{raw,cleaned,meta}`);

      return basePath;

    } catch (saveError: any) {
      this.error(`Failed to save invalid output: ${saveError.message}`);
      return '';
    }
  }
}

// Export logger instance after class declaration
export const logger = CompactLoggerWrapper.getInstance();

/**
 * CompactLogger - Unified logging system for clean console output and detailed file logs
 */
// Using wrapper class instead - see compact-logger-wrapper.js
export class CompactLogger extends CompactLoggerWrapper {
  private constructor() {
    super();
  }
  
  static getInstance(): CompactLogger {
    return CompactLoggerWrapper.getInstance() as CompactLogger;
  }

  // All methods are now inherited from CompactLoggerWrapper
}


// Create wrapper classes for ProgressTracker and Spinner for backward compatibility
export class ProgressTracker {
  private total: number;
  private itemType: string;

  constructor(totalItems: number, itemType: string = 'items', useCompactMode: boolean = false) {
    this.total = totalItems;
    this.itemType = itemType;
    // useCompactMode is now always true internally
  }

  start(message: string): void {
    output.writeLine(message);
    output.startProgress(this.total, this.itemType);
  }

  update(current: number, message: string): void {
    output.updateProgress(current, message);
  }

  setStatus(message: string, duration?: number): void {
    // Status is now part of the message in updateProgress
    output.updateProgress(0, message);
  }

  clearStatus(): void {
    // Not needed with new system
  }

  setFileLogger(logger: any): void {
    // Not needed with new system
  }

  logToFile(level: string, message: string): void {
    output.debug(`[${level}] ${message}`);
  }

  complete(message?: string): void {
    output.completeProgress(message);
  }

  error(message: string): void {
    output.cancelProgress();
    output.error(message);
  }

  stop(): void {
    output.cancelProgress();
  }
}


export class Spinner {
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    output.startSpinner(this.message);
  }

  stop(success: boolean = true, finalMessage?: string): void {
    output.stopSpinner(success, finalMessage);
  }
}

