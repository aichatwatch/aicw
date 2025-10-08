import { promises as fs } from 'fs';
import path from 'path';
import { writeFileAtomic } from './misc-utils.js';
import { injectlinkTypeNames } from './report-utils.js';
import { REPORT_HTML_TEMPLATE_DIR } from '../config/paths.js';

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
   * Copy standard template files to both output directories
   */
  async copyTemplateFiles(): Promise<void> {
    const templateFiles = [
      'app.js',
      'app-modular.js',
      'data-config.js'
    ];

    for (const filename of templateFiles) {
      const sourcePath = path.join(this.config.templateDir!, filename);

      try {
        // Copy to output directory
        await fs.copyFile(sourcePath, path.join(this.config.outputDir, filename));

      } catch (error) {
        // Some files may not exist (app-modular.js, data-config.js), ignore errors
        if (filename === 'app.js') {
          // app.js should always exist, re-throw the error
          throw error;
        }
      }
    }
  }

  /**
   * Process and write data-static.js with link type names injection to both directories
   */
  async writeDataStaticFile(): Promise<void> {
    const dataStaticTemplate = await fs.readFile(path.join(this.config.templateDir!, 'data-static.js'), 'utf-8');
    const dataStaticWithPersons = injectlinkTypeNames(dataStaticTemplate);
    const filename = `${this.config.date}-data-static.js`;

    await writeFileAtomic(path.join(this.config.outputDir, filename), dataStaticWithPersons);
  }

  /**
   * Write HTML content to both directories
   */
  async writeHtmlFile(content: string, filename: string = 'index.html'): Promise<void> {
    await writeFileAtomic(path.join(this.config.outputDir, filename), content);
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

  /**
   * Complete standard report file operations
   * This combines the most common operations done in both report generation files
   */
  async writeStandardReportFiles(htmlContent: string): Promise<void> {
    await this.createDirectories();
    await this.writeHtmlFile(htmlContent);
    await this.copyTemplateFiles();
    await this.writeDataStaticFile();
  }
}