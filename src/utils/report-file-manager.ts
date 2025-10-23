import { promises as fs } from 'fs';
import path from 'path';
import { writeFileAtomic } from './misc-utils.js';
import { injectlinkTypeNames } from './report-utils.js';
import { REPORT_HTML_TEMPLATE_DIR } from '../config/paths.js';
import { replaceMacrosInTemplate } from './misc-utils.js';
import { logger } from './compact-logger.js';

/**
 * Configuration for report file operations
 */
export interface ReportFileConfig {
  date: string;
  outputDir: string;
  templateDir?: string;
}

/**
 * Manages common file operations for report generation
 */
export class ReportFileManager {
  private config: ReportFileConfig;

  constructor(config: ReportFileConfig) {
    this.config = {
      ...config,
      templateDir: config.templateDir || REPORT_HTML_TEMPLATE_DIR
    };
  }

  /**
   * Process and write data-static.js with link type names injection to both directories
   */
  async writeDataStaticFile(): Promise<void> {
    const dataStaticTemplate = await fs.readFile(path.join(this.config.templateDir!, 'data-static.js'), 'utf-8');
    const dataStaticWithLinkTypeNames = injectlinkTypeNames(dataStaticTemplate);
    const filename = `${this.config.date}-data-static.js`;

    await writeFileAtomic(path.join(this.config.outputDir, filename), dataStaticWithLinkTypeNames);
  }

  /**
   * Write HTML content to both directories
   */
  async writeHtmlFile(content: string, filename: string = 'index.html'): Promise<void> {
    await writeFileAtomic(path.join(this.config.outputDir, filename), content);
  }

  async writeReportFiles(files: { filename: string, replacements: Record<string, string> }[]): Promise<void> {

    await this.createDirectories();
    await this.writeDataStaticFile();    

    // write given files with replacements
    for (const file of files) {
      const content = await fs.readFile(path.join(this.config.templateDir!, file.filename), 'utf-8');
      const processedContent = await replaceMacrosInTemplate(
        content, 
        file.replacements, 
        false // turn off verifications of unreplaced macros (but it will verify the original macro anyway)
      );
      logger.info(`Writing file ${file.filename} to ${path.join(this.config.outputDir, file.filename)}`);
      await writeFileAtomic(path.join(this.config.outputDir, file.filename), processedContent);
    }
  }

  /**
   * Write data file to both directories
   */
  async writeDataFile(content: string, filename: string): Promise<void> {
    await writeFileAtomic(path.join(this.config.outputDir, filename), content);
  }

  /**
   * Create both output directories
   */
  async createDirectories(): Promise<void> {
    await fs.mkdir(this.config.outputDir, { recursive: true });
  }

}