import { promises as fs } from 'fs';
import path from 'path';
import { DirentLike } from '../config/types.js';
import { REPORT_HTML_TEMPLATE_DIR, QUESTIONS_DIR, REPORT_DIR, OUTPUT_DIR, PROJECT_REPORTS_DIR, QUESTION_DATA_COMPILED_DATE_DIR, AGGREGATED_DATA_COMPILED_DATE_DIR } from '../config/paths.js';
import { getCategoriesForItemsByType, MAIN_SECTIONS } from '../config/entities.js';
import { replaceMacrosInTemplate, writeFileAtomic } from './misc-utils.js';
import { logger } from './compact-logger.js';
import {
  normalizeModelWeights,
  calculateWeightedInfluence,
  calculateInfluenceByModel,
  normalizeInfluences
} from './influence-calculator.js';
import { ReportFileManager } from './report-file-manager.js';
import { loadProjectModelConfigs, readQuestions } from './project-utils.js';
import { QuestionEntry } from '../config/types.js';
import { getCurrentDateTimeAsStringISO, getProjectNameFromProjectFolder } from '../config/user-paths.js';
import { ModelType } from './project-utils.js';
// Load enriched data file and parse it
async function loadEnrichedData(filePath: string): Promise<any> {
  const content = await fs.readFile(filePath, 'utf-8');
  
  // Extract the data object using regex to handle window.AppData assignment
  const match = content.match(/window\.AppData\d*\s*=\s*(\{[\s\S]*\});?\s*$/m);
  if (!match) {
    throw new Error(`Could not parse data from ${filePath}`);
  }
  
  // Use Function constructor to safely evaluate the object literal
  const dataStr = match[1];
  const data = new Function(`return ${dataStr}`)();
  return data;
}

// Merge items from multiple prompts
async function mergeItems(project: string, itemsByPrompt: Record<string, any[]>, arrayName: string, questionsByPrompt: Record<string, string>, baseData?: any): Promise<any[]> {
  const mergedMap = new Map<string, any>();
  
  for (const [promptId, items] of Object.entries(itemsByPrompt)) {
    for (const item of items) {
      const key = item.value.toLowerCase(); // Use lowercase for case-insensitive matching
      
      if (!mergedMap.has(key)) {
        // First occurrence - initialize the merged item
        mergedMap.set(key, {
          ...item,
          mentionsByPrompt: {},
          influenceByPrompt: {},
          mentionsByModelByPrompt: {},
          appearanceOrderByPrompt: {},
          excerptsByModelByPrompt: {}, // Add this to track excerpts by prompt
          _uniqueMentionsByModel: {} // Track unique mentions per model
        });
        
        // Initialize unique mentions tracking for first prompt
        const merged = mergedMap.get(key)!;
        for (const [modelId, mentions] of Object.entries(item.mentionsByModel || {})) {
          merged._uniqueMentionsByModel[modelId] = mentions as number;
        }
      }
      
      const merged = mergedMap.get(key)!;
      
      // Store per-prompt data
      merged.mentionsByPrompt[promptId] = item.mentions || 0;
      merged.influenceByPrompt[promptId] = item.influence || 0;
      merged.appearanceOrderByPrompt[promptId] = item.appearanceOrder || -1;  // Note: appearanceOrder is order of appearance, not rank
      merged.mentionsByModelByPrompt[promptId] = item.mentionsByModel || {};

      // Store appearanceOrder by model for each prompt (for proper aggregation)
      if (!merged.appearanceOrderByModelByPrompt) {
        merged.appearanceOrderByModelByPrompt = {};
      }
      merged.appearanceOrderByModelByPrompt[promptId] = item.appearanceOrderByModel || {};
      
      // Store excerpts with prompt information
      if (item.excerptsByModel) {
        merged.excerptsByModelByPrompt[promptId] = item.excerptsByModel;
      }
      
      // Aggregate mentions - properly handle multiple questions
      if (promptId !== Object.keys(itemsByPrompt)[0]) {
        // Not the first prompt, so aggregate
        // For total mentions, we need to properly aggregate without double-counting
        // Each model should only be counted once across all questions
        
        // Track unique mentions by model across all questions
        if (!merged._uniqueMentionsByModel) {
          merged._uniqueMentionsByModel = {};
        }
        
        // Update unique mentions for each model (taking max across questions)
        for (const [modelId, mentions] of Object.entries(item.mentionsByModel || {})) {
          merged._uniqueMentionsByModel[modelId] = Math.max(
            merged._uniqueMentionsByModel[modelId] || 0,
            mentions as number
          );
        }
        
        // Recalculate total mentions as sum of unique mentions per model
        merged.mentions = Object.values(merged._uniqueMentionsByModel).reduce((sum: number, count: any) => sum + (count as number), 0);
        
        // Keep mentionsByModel as the sum for backward compatibility, but it represents total across questions
        for (const [modelId, mentions] of Object.entries(item.mentionsByModel || {})) {
          merged.mentionsByModel[modelId] = (merged.mentionsByModel[modelId] || 0) + (mentions as number);
        }
        
        
        // Aggregate weighted influence
        merged.weightedInfluence = (merged.weightedInfluence || 0) + (item.weightedInfluence || 0);
        
        
        // Merge trend values (keep the most recent trends)
        if (item.mentionsTrendVals && item.mentionsTrendVals.length > 0) {
          merged.mentionsTrendVals = item.mentionsTrendVals;
          merged.mentionsTrend = item.mentionsTrend;
        }
        
        if (item.influenceTrendVals && item.influenceTrendVals.length > 0) {
          merged.influenceTrendVals = item.influenceTrendVals;
          merged.influenceTrend = item.influenceTrend;
        }
        
        if (item.appearanceOrderTrendVals && item.appearanceOrderTrendVals.length > 0) {
          merged.appearanceOrderTrendVals = item.appearanceOrderTrendVals;
          merged.appearanceOrderTrend = item.appearanceOrderTrend;
        }
      }
    }
  }
  
  // Convert map back to array and recalculate appearanceOrders
  const mergedArray = Array.from(mergedMap.values());
  
  // Validation: Check for suspiciously high mention counts
  const modelCount = Object.keys(itemsByPrompt[Object.keys(itemsByPrompt)[0]][0]?.mentionsByModel || {}).length;
  const questionCount = Object.keys(itemsByPrompt).length;
  const maxReasonableMentions = modelCount * questionCount * 10; // Assume max 10 mentions per model per question
  
  mergedArray.forEach(item => {
    if (item.mentions > maxReasonableMentions) {
      logger.warn(`WARNING: Suspiciously high mention count for "${item.value}": ${item.mentions} mentions (max reasonable: ${maxReasonableMentions})`);
      logger.warn(`  Models: ${modelCount}, Questions: ${questionCount}`);
      logger.warn(`  Mentions by model: ${JSON.stringify(item.mentionsByModel)}`);
    }
    
    // Clean up internal tracking field
    delete item._uniqueMentionsByModel;
  });
  
  // Merge excerpts from all prompts into a single excerptsByModel with question info
  mergedArray.forEach(item => {
    if (item.excerptsByModelByPrompt && Object.keys(item.excerptsByModelByPrompt).length > 0) {
      item.excerptsByModel = {};
      
      // For each prompt that has excerpts
      for (const [promptId, excerptsByModel] of Object.entries(item.excerptsByModelByPrompt)) {
        const question = questionsByPrompt[promptId] || promptId;
        
        // For each model in this prompt's excerpts
        for (const [modelId, excerpts] of Object.entries(excerptsByModel as any)) {
          if (!item.excerptsByModel[modelId]) {
            item.excerptsByModel[modelId] = [];
          }
          
          // Add excerpts with question information
          for (const excerpt of excerpts as any[]) {
            item.excerptsByModel[modelId].push({
              ...excerpt,
              question: question,
              promptId: promptId
            });
          }
        }
      }
    }
  });
  

  const aiModelsForAnswer = await loadProjectModelConfigs(project, ModelType.GET_ANSWER);
  
  const normalizedWeights = normalizeModelWeights(aiModelsForAnswer);
  
  let maxMentionsOverall = 0;
  const maxMentionsByModel = new Map<string, number>();

  for (const item of mergedArray) {
    // Calculate average appearanceOrder (order of appearance) from all prompts
    const appearanceOrders: number[] = [];
    const appearanceOrderByModel: { [modelId: string]: number[] } = {};

    // Aggregate appearanceOrders from all prompts
    for (const promptId of Object.keys(item.mentionsByPrompt || {})) {
      if (item.appearanceOrderByPrompt && item.appearanceOrderByPrompt[promptId] > 0) {
        appearanceOrders.push(item.appearanceOrderByPrompt[promptId]);
      }

      // Aggregate per-model appearanceOrders if available
      if (item.appearanceOrderByModelByPrompt && item.appearanceOrderByModelByPrompt[promptId]) {
        for (const [modelId, pos] of Object.entries(item.appearanceOrderByModelByPrompt[promptId])) {
          if (!appearanceOrderByModel[modelId]) {
            appearanceOrderByModel[modelId] = [];
          }
          if (typeof pos === 'number' && pos > 0) {
            appearanceOrderByModel[modelId].push(pos);
          }
        }
      }
    }

    // Calculate average appearanceOrders (order of appearance, not rank)
    if (appearanceOrders.length > 0) {
      item.appearanceOrder = Number((appearanceOrders.reduce((a, b) => a + b, 0) / appearanceOrders.length).toFixed(2));
    } else {
      item.appearanceOrder = item.mentions > 0 ? 999 : -1;
    }

    // Calculate average appearanceOrder by model
    item.appearanceOrderByModel = {};
    for (const [modelId, modelAppearanceOrders] of Object.entries(appearanceOrderByModel)) {
      if (modelAppearanceOrders.length > 0) {
        item.appearanceOrderByModel[modelId] = Number(
          (modelAppearanceOrders.reduce((a: number, b: number) => a + b, 0) / modelAppearanceOrders.length).toFixed(2)
        );
      } else if (item.mentionsByModel && item.mentionsByModel[modelId] > 0) {
        item.appearanceOrderByModel[modelId] = 999; // Unknown appearanceOrder
      }
    }

    // Track max mentions for normalization
    if (item.mentions > maxMentionsOverall) {
      maxMentionsOverall = item.mentions;
    }

    if (item.mentionsByModel) {
      for (const [modelId, mentions] of Object.entries(item.mentionsByModel)) {
        const current = maxMentionsByModel.get(modelId) || 0;
        if ((mentions as number) > current) {
          maxMentionsByModel.set(modelId, mentions as number);
        }
      }
    }
  }

  // Recalculate influence using proper appearanceOrder data (order of appearance)
  for (const item of mergedArray) {
    if (!item.mentions || item.mentions === 0) {
      item.influence = 0;
      item.influenceByModel = {};
      
      item.weightedInfluence = 0;
      
      continue;
    }

    
    // Calculate weighted influence with appearanceOrder (order of appearance)
    item.influence = calculateWeightedInfluence(
      item.mentionsByModel || {},
      item.appearanceOrderByModel || {},
      normalizedWeights,
      maxMentionsOverall
    );

    // Calculate per-model influence
    item.influenceByModel = calculateInfluenceByModel(
      item.mentionsByModel || {},
      item.appearanceOrderByModel || {},
      normalizedWeights,
      maxMentionsByModel
    );
    

    
    // Keep weightedInfluence for backward compatibility
    item.weightedInfluence = item.influence;
    
  }

  
  // Normalize all influences so max = 1.0
  normalizeInfluences(mergedArray);
  

  // No sorting here - let the frontend handle sorting by any column the user prefers
  // Note: appearanceOrder field represents the average order of appearance in answers
  
  return mergedArray;
}


// Collect questions data with answer counts
async function collectQuestionsData(project: string, date: string, questions: QuestionEntry[]): Promise<any> {
  const questionsData: any[] = [];
  let totalAnswers = 0;
  
  for (const question of questions) {
    const promptId = question.folder;
    const questionText = question.question;
    // Extract question number from promptId (e.g., "1-what-are-the-best-ci" -> 1)
    const questionNumber = parseInt(promptId.split('-')[0]) || 0;
    
    // Count answers by checking model directories
    const answersPath = path.join(QUESTIONS_DIR(project), promptId, 'answers', date);
    let answerCount = 0;
    
    try {
      const modelDirs = await fs.readdir(answersPath, { withFileTypes: true });
      // Count directories that contain actual answer files
      for (const dir of modelDirs) {
        if (dir.isDirectory()) {
          try {
            const answerFile = path.join(answersPath, dir.name, 'answer.md');
            await fs.access(answerFile);
            answerCount++;
          } catch {
            // No answer file in this model directory
          }
        }
      }
    } catch (error) {
      logger.warn(`Could not count answers for ${promptId}: ${error}`);
    }
    
    totalAnswers += answerCount;
    
    questionsData.push({
      id: promptId,
      number: questionNumber,
      text: questionText,
      answerCount: answerCount,
      reportUrl: `./${promptId}/index.html`
    });
  }
  
  // Sort by question number
  questionsData.sort((a, b) => a.number - b.number);
  
  return {
    questions: questionsData,
    totalQuestions: questionsData.length,
    totalAnswers: totalAnswers,
    reportDate: date
  };
}

// Main aggregation function
export async function generateAggregateReport(project: string, date: string): Promise<void> {
  logger.info(`Starting aggregate report generation for ${project} on ${date}`);
  
  try {
    // Load questions
    const questions = await readQuestions(project);
    const promptIds = questions.map(q => q.folder);
    logger.info(`Found ${promptIds.length} prompts to aggregate`);
    
    // Collect questions data with answer counts
    const questionsData = await collectQuestionsData(project, date, questions);
    logger.info(`Collected questions data: ${questionsData.totalQuestions} questions, ${questionsData.totalAnswers} total answers`);
    
    // Load all enriched data files
    const dataByPrompt: Record<string, any> = {};
    const validPrompts: string[] = [];
    
    for (const promptId of promptIds) {
      // Try to load from OUTPUT directory first (which has excerpts with line/column info)
      const outputDataPath = path.join(OUTPUT_DIR(project, date), promptId, `${date}-data.js`);
      const compiledDataPath = path.join(QUESTION_DATA_COMPILED_DATE_DIR(project, promptId, date), `${date}-data.js`);
      
      try {
        let data;
        try {
          // First try OUTPUT directory which has excerpts
          data = await loadEnrichedData(outputDataPath);
          logger.info(`Loaded data for ${promptId} from OUTPUT directory (with excerpts)`);
        } catch (outputError) {
          // Fallback to data-compiled directory
          data = await loadEnrichedData(compiledDataPath);
          logger.info(`Loaded data for ${promptId} from data-compiled directory (no excerpts)`);
        }
        
        dataByPrompt[promptId] = data;
        validPrompts.push(promptId);
      } catch (error) {
        logger.warn(`Failed to load data for ${promptId}: ${error}`);
      }
    }
    
    if (validPrompts.length === 0) {
      throw new Error('No valid prompt data found to aggregate');
    }
    
    logger.info(`Successfully loaded data from ${validPrompts.length} prompts`);
    
    // Extract data by type from each prompt
    const itemsByType: Record<string, Record<string, any[]>> = {};
    
    // Initialize itemsByType with categories
    for (const category of getCategoriesForItemsByType()) {
      itemsByType[category] = {};
    }
    
    const questionsByPrompt: Record<string, string> = {};

    // Collect items from each prompt
    for (const [promptId, data] of Object.entries(dataByPrompt)) {
      for (const arrayName of Object.keys(itemsByType)) {
        itemsByType[arrayName][promptId] = data[arrayName] || [];
      }
      questionsByPrompt[promptId] = data.report_question || promptId;
    }
    
    // Take base structure from first valid prompt
    const baseData = dataByPrompt[validPrompts[0]];

    // Create aggregated data structure
    const aggregatedData = {
      ...baseData,
      report_type: 'aggregate',
      report_date: date,
      report_question: project, // Use project name instead of generic text
      report_title: project,     // Also set report_title for consistency
      prompts: validPrompts,
      promptQuestions: questions,
      questionsData: questionsData,  // Add questions data with answer counts

      // Fix report metadata for aggregate reports
      reportMetadata: {
        isQuestionReport: false,
        isAggregateReport: true,
        totalQuestions: validPrompts.length,
        questionsIncluded: validPrompts
      },

      // Include bots array from base data (all questions use the same bots)
      bots: baseData.bots || [],

      // Update counts
      totalDataPoints: 0,
      totalCounts: {}
    };

    // Aggregate arrays

    // Merge items and recalculate total counts
    for (const name of MAIN_SECTIONS) {
      aggregatedData[name] = await mergeItems(project, itemsByType[name], name, questionsByPrompt, baseData);
      aggregatedData.totalCounts[name] = aggregatedData[name].length;
      aggregatedData.totalDataPoints += aggregatedData[name].length;
    }

    // Add bots count to totalCounts
    aggregatedData.totalCounts.bots = aggregatedData.bots ? aggregatedData.bots.length : 0;
    
    // Recalculate itemCountPerModel and itemCountPerAppearanceOrderTrend
    aggregatedData.itemCountPerModel = {};
    aggregatedData.itemCountPerAppearanceOrderTrend = {};
    
    for (const arrayName of MAIN_SECTIONS ) {
      // Count by model
      const modelCounts: Record<string, number> = {};
      const trendCounts: Record<string, number> = {};
      
      for (const item of aggregatedData[arrayName]) {
        // Count by model
        for (const [modelId, mentions] of Object.entries(item.mentionsByModel || {})) {
          if ((mentions as number) > 0) {
            modelCounts[modelId] = (modelCounts[modelId] || 0) + 1;
          }
        }
        
        // Count by trend
        const trend = String(item.appearanceOrderTrend || -9999);
        trendCounts[trend] = (trendCounts[trend] || 0) + 1;
      }
      
      // Convert to array format
      aggregatedData.itemCountPerModel[arrayName] = Object.entries(modelCounts)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count);
        
      aggregatedData.itemCountPerAppearanceOrderTrend[arrayName] = Object.entries(trendCounts)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count);
    }
    
    // Add linkTypes handling if it exists
    if (aggregatedData.linkTypes && Array.isArray(aggregatedData.linkTypes)) {
      const linkTypeModelCounts: Record<string, number> = {};
      const linkTypeTrendCounts: Record<string, number> = {};
      
      for (const linkType of aggregatedData.linkTypes) {
        // Count by model
        for (const [modelId, mentions] of Object.entries(linkType.mentionsByModel || {})) {
          if ((mentions as number) > 0) {
            linkTypeModelCounts[modelId] = (linkTypeModelCounts[modelId] || 0) + 1;
          }
        }
        
        // Count by trend
        const trend = String(linkType.appearanceOrderTrend || -9999);
        linkTypeTrendCounts[trend] = (linkTypeTrendCounts[trend] || 0) + 1;
      }
      
      // Convert to array format
      aggregatedData.itemCountPerModel.linkTypes = Object.entries(linkTypeModelCounts)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count);
        
      aggregatedData.itemCountPerAppearanceOrderTrend.linkTypes = Object.entries(linkTypeTrendCounts)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count);
    }
    
    // Create output directories and file manager
    const outputDir = OUTPUT_DIR(project, date);

    const fileManager = new ReportFileManager({
      date,
      outputDir    
    });

    // Generate the data file
    const dataContent = `// AUTO-GENERATED AGGREGATE: ${new Date().toISOString()}
// Aggregated from prompts: ${validPrompts.join(', ')}
window.AppDataAggregate${date.replace(/-/g, '')} = ${JSON.stringify(aggregatedData, null, 2)};
window.AppData = window.AppDataAggregate${date.replace(/-/g, '')};`;

    // Process HTML template
    let htmlContent = await fs.readFile(path.join(REPORT_HTML_TEMPLATE_DIR, 'index.html'), 'utf-8');

    // Replace template macros
    htmlContent = await replaceMacrosInTemplate(htmlContent, {
      '{{REPORT_TITLE}}': aggregatedData.report_title || project,
      '{{PROJECT_NAME}}': getProjectNameFromProjectFolder(project), 
      '{{REPORT_DATE}}': date,
//      '{{REPORT_QUESTION_ID}}': 'aggregate',
      '{{REPORT_DATE_WITHOUT_DASHES}}': date.replace(/-/g, ''),
      '{{REPORT_CREATED_AT_DATETIME}}': getCurrentDateTimeAsStringISO()   
    }); 

    // Write all standard files using file manager
    await fileManager.writeStandardReportFiles(htmlContent);
    await fileManager.writeDataFile(dataContent, `${date}-data.js`);

    // copy answers file 
    const answersFile = path.join(AGGREGATED_DATA_COMPILED_DATE_DIR(project, date), `${date}-answers.js`);
    await fs.copyFile(answersFile, path.join(outputDir, `${date}-answers.js`));
    logger.info(`Copied answers file ${answersFile} to ${path.join(outputDir, `${date}-answers.js`)}`);
    
    logger.info(`Aggregate report generated successfully at:`);
    logger.info(`  - ${outputDir}/index.html`);

    
  } catch (error) {
    logger.error(`Failed to generate aggregate report: ${error}`);
    throw error;
  }
}
