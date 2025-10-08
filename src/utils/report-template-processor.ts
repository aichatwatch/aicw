import { replaceMacrosInTemplate } from './misc-utils.js';
import { formatReportDate } from './report-utils.js';

/**
 * Configuration for HTML template processing
 */
export interface TemplateProcessorConfig {
  date: string;
  dataFilename?: string; // e.g., 'data.js'
  isAggregate?: boolean;
}
