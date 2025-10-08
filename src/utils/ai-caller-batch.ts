import { promises as fs } from 'fs';
import { logger } from   './compact-logger.js';
import { ModelConfig } from './model-config.js';
import { callAIWithRetry, createAiClientInstance } from './ai-caller.js';
import { parseCsvWithAttributes } from './csv-parser.js';
import { cleanContentFromAI } from './content-cleaner.js';
import { output } from './output-manager.js';
import { loadProjectModelConfigs_FIRST, ModelType } from './project-utils.js';
import { PipelineCriticalError } from './pipeline-errors.js';
import { replaceMacrosInTemplate } from './misc-utils.js';

// get action name for the current module
import { getModuleNameFromUrl } from './misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

export interface AIEnrichmentItem {
  id: number;
  value: string;
}

export interface AIEnrichmentConfig {
  modelToUse: ModelConfig;
  promptTemplatePath: string;
  responseFormat: 'csv' | 'json';
  csvColumns?: string[];
  batchSize?: number;
  maxItems?: number;
  temperature?: number;
  maxTokens?: number;
  cacheNamePrefix?: string;
}

export interface AIEnrichmentResult {
  [key: string]: any;
}

export class AICallerBatch {
  constructor(
    private project: string, 
    private modelType: ModelType,
    private additionalMacrosToValues: Record<string, string> = {}
  ) {}

  /**
   * Enrich items using AI in batches
   */
  async enrichItems(
    items: AIEnrichmentItem[],
    config: AIEnrichmentConfig  
  ): Promise<Map<number, AIEnrichmentResult>> {
    const results = new Map<number, AIEnrichmentResult>();

    // Configuration defaults
    const batchSize = config.batchSize || 20;
    const maxItems = config.maxItems || items.length;
    const temperature = config.temperature || 0.3;
    const maxTokens = config.maxTokens || 4000;

    // Limit items if maxItems is set
    const itemsToProcess = items.slice(0, maxItems);

    if (itemsToProcess.length === 0) {
      logger.debug('No items to process');
      return results;
    }

    // Load prompt template
    let promptTemplate: string;
    try {
      promptTemplate = await fs.readFile(config.promptTemplatePath, 'utf-8');
    } catch (error) {
      logger.error(`Failed to load prompt template from ${config.promptTemplatePath}`);
      throw error;
    }

    // Get models for fallback
    const modelToUse = await loadProjectModelConfigs_FIRST(this.project, this.modelType);

    logger.info(`Processing ${itemsToProcess.length} items in batches of ${batchSize}`);

    // Process in batches
    for (let i = 0; i < itemsToProcess.length; i += batchSize) {
      const batch = itemsToProcess.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(itemsToProcess.length / batchSize);

      logger.debug(`Processing batch ${batchNum}/${totalBatches} with ${batch.length} items`);

      try {
        // Start spinner for this batch
        const modelName = modelToUse.display_name;
        output.startSpinner(`Processing batch ${batchNum}/${totalBatches} with ${modelName}...`);

        // Build prompt
        const prompt = await this.buildPrompt(batch, promptTemplate);

        // Call AI with fallback, passing status update callback
        const response = await this.callAIWithFallback(
          modelToUse,
          prompt,
          temperature,
          maxTokens,
          `Batch ${batchNum}/${totalBatches}`,
          config.responseFormat,
          batchNum,
          totalBatches,
          config.cacheNamePrefix
        );

        // Parse response
        const parsed = config.responseFormat === 'csv'
          ? this.parseCSVResponse(response, config.csvColumns || ['id', 'value'])
          : this.parseJSONResponse(response);

        // Update results and cache
        await this.updateResults(results, parsed, batch);

        // Stop spinner on success
        output.stopSpinner(true, `Batch ${batchNum}/${totalBatches} completed`);
        logger.debug(`Successfully processed batch ${batchNum}/${totalBatches}`);

      } catch (error) {
        // Stop spinner on error
        output.stopSpinner(false, `Failed to process batch ${batchNum}`);
        logger.error(`Failed to process batch ${batchNum}: ${error}`);
        // Continue with next batch instead of failing entirely
        throw new PipelineCriticalError(
          `Failed to process batch ${batchNum}: ${error}`,
          CURRENT_MODULE_NAME,
          this.project
        );
      }

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < itemsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    logger.info(`AI enrichment complete: processed ${results.size} items`);

    return results;
  }

  /**
   * Build prompt from template and items
   */
  private async buildPrompt(items: AIEnrichmentItem[], template: string): Promise<string> 
    {
    // forming the list like 
    // 1,value1
    // 2,value2
    const itemsListAsString: string = items.map(item => {
      return `${item.id},${item.value}`;
    }).join('\n');

    let prompt = await replaceMacrosInTemplate(template, {
      '{{ITEMS}}': itemsListAsString,
      ...this.additionalMacrosToValues
    });

    return prompt;
  }

  /**
   * Call AI with model fallbacks
   */
  private async callAIWithFallback(
    modelConfig: ModelConfig,
    prompt: string,
    temperature: number,
    maxTokens: number,
    contextInfo: string,
    responseFormat: 'csv' | 'json' = 'csv',
    batchNum?: number,
    totalBatches?: number,
    cacheNamePrefix?: string
  ): Promise<string> {

      logger.debug(`Attempting enrichment with model ${modelConfig.display_name}`);

      try {
        const aiClientInstance = createAiClientInstance(modelConfig);

        const systemMessage = responseFormat === 'csv'
          ? 'You are a data enrichment assistant. Return ONLY CSV data in the exact format requested. No JSON, no explanations, no headers unless specified. Each row should contain the ID and the requested fields separated by commas.'
          : 'You are a data enrichment assistant. Return results in the exact format requested. Be concise and accurate.';

        const response = await callAIWithRetry(
          aiClientInstance,
          modelConfig,
          {
            model: modelConfig.model,
            messages: [
              {
                role: 'system',
                content: systemMessage
              },
              { role: 'user', content: prompt }
            ],
            temperature,
            max_tokens: maxTokens
          },
          {
            cacheNamePrefix: cacheNamePrefix,
            contextInfo: `AI Batch Enrichment - ${contextInfo} with ${modelConfig.display_name}`,
            onStatusUpdate: (statusMessage: string) => {
              // Update spinner with retry status
              if (batchNum && totalBatches) {
                output.updateSpinner(`Batch ${batchNum}/${totalBatches} with ${modelConfig.display_name} - ${statusMessage}`);
              }
            }
          }
        );

        const result = response.choices[0]?.message?.content || '';

        if (!result) {
          throw new Error('Empty response from AI');
        }

        logger.debug(`Successfully got response from ${modelConfig.display_name}`);
        return result;

      } catch (error: any) {
        logger.error(`Failed with ${modelConfig.display_name}: ${error.message}`);
        throw new PipelineCriticalError(
          `Failed with ${modelConfig.display_name}: ${error.message}`,
          CURRENT_MODULE_NAME,
          this.project
        );
      }
  }

  /**
   * Parse CSV response from AI
   */
  private parseCSVResponse(response: string, columns: string[]): Map<number, AIEnrichmentResult> {
    const results = new Map<number, AIEnrichmentResult>();

    try {
      const cleanResponse = cleanContentFromAI(response);
      const parsed = parseCsvWithAttributes(cleanResponse, columns);

      for (const row of parsed.rows) {
        const id = parseInt(row.data[columns[0]], 10);
        if (isNaN(id)) {
          logger.warn(`Invalid ID in CSV response: ${row.data[columns[0]]}`);
          continue;
        }

        // Create result object from CSV columns
        const result: AIEnrichmentResult = {};
        for (let i = 1; i < columns.length; i++) {
          const column = columns[i];
          const value = row.data[column];

          // Handle comma-separated values for columns like 'similar'
          if (value && value.includes(',') && column === 'similar') {
            result[column] = value.split(',').map(v => v.trim()).filter(v => v);
          } else {
            result[column] = value;
          }
        }

        results.set(id, result);
      }

    } catch (error) {
      logger.error(`Failed to parse CSV response: ${error}`);
      logger.debug(`Response was: ${response.substring(0, 500)}...`);
    }

    return results;
  }

  /**
   * Parse JSON response from AI
   */
  private parseJSONResponse(response: string): Map<number, AIEnrichmentResult> {
    const results = new Map<number, AIEnrichmentResult>();

    try {
      const cleanResponse = cleanContentFromAI(response);
      const parsed = JSON.parse(cleanResponse);

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item.id === 'number') {
            const { id, ...result } = item;
            results.set(id, result);
          }
        }
      } else if (typeof parsed === 'object') {
        // Handle object format { "1": {...}, "2": {...} }
        for (const [idStr, value] of Object.entries(parsed)) {
          const id = parseInt(idStr, 10);
          if (!isNaN(id) && typeof value === 'object') {
            results.set(id, value as AIEnrichmentResult);
          }
        }
      }

    } catch (error) {
      logger.error(`Failed to parse JSON response: ${error}`);
      logger.debug(`Response was: ${response.substring(0, 500)}...`);
    }

    return results;
  }

  /**
   * Update results and cache
   */
  private async updateResults(
    results: Map<number, AIEnrichmentResult>,
    parsed: Map<number, AIEnrichmentResult>,
    batch: AIEnrichmentItem[]
  ): Promise<void> {
    for (const [id, result] of parsed) {
      results.set(id, result);
    }  
  }
}