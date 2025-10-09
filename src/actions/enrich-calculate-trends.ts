import { promises as fs } from 'fs';
import { DirentLike } from '../config/types.js';
import { QUESTIONS_DIR } from '../config/paths.js';
import { AGGREGATED_DIR_NAME } from '../config/constants.js';
import { waitForEnterInInteractiveMode } from '../utils/misc-utils.js';
import { logger } from '../utils/compact-logger.js';
import { isInterrupted } from '../utils/delay.js';
import { MAIN_SECTIONS } from '../config/entities.js';
import { PipelineCriticalError, createMissingFileError } from '../utils/pipeline-errors.js';
import {
  loadProjectModelConfigs,
  loadDataJs,
  saveDataJs,
  getPreviousDataFiles,
  getTargetDateFromProjectOrEnvironment,
  getProjectNameFromCommandLine,
  validateAndLoadProject,
} from '../utils/project-utils.js';
import {
  EnrichedItem
,  prepareStepFiles } from '../utils/enrich-data-utils.js';
import { addReportMetadata } from '../utils/report-metadata.js';
import { ModelType } from '../utils/project-utils.js';

// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);


// Trend indicators
const TRENDS = {
  UP: 10,          // "↑" - rising trend
  DOWN: -1,        // "↓" - falling trend
  STABLE: 1,       // "→" - stable trend
  NEW: 999,        // "🆕" - new item
  DISAPPEARED: -99, // "x" - disappeared item
  FLUCTUATING: 0,  // "↔" - fluctuating trend
  UNKNOWN: -9999   // "?" - unknown/no data
};

/**
 * Calculate trend indicator based on current and previous values
 */
function calculateTrend(current: number, previous: number | undefined): number {
  if (previous === undefined || previous === 0) {
    return current > 0 ? TRENDS.NEW : TRENDS.UNKNOWN;
  }
  if (current === 0 && previous > 0) {
    return TRENDS.DISAPPEARED;
  }
  if (current > previous) {
    return TRENDS.UP;
  }
  if (current < previous) {
    return TRENDS.DOWN;
  }
  return TRENDS.STABLE;
}

/**
 * Load previous data and create lookup maps
 */
async function loadPreviousData(
  previousFiles: string[]
): Promise<{ dataArrays: any[], dates: string[] }> {
  const dataArrays: any[] = [];
  const dates: string[] = [];

  for (const file of previousFiles) {
    try {
      const { data } = await loadDataJs(file);
      dataArrays.push(data);

      // Extract date from filename
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})-data\.js/);
      if (dateMatch) {
        dates.push(dateMatch[1]);
      }
    } catch (error) {
      logger.debug(`Could not load previous data from ${file}: ${error}`);
    }
  }

  return { dataArrays, dates };
}

/**
 * Initialize trend properties for an item
 */
function initializeTrendProperties(
  item: EnrichedItem,
  prevItems: any[],
  currentDate: string,
  previousDates: string[],
  models: any[]
): void {
  // Build trend arrays with all dates (newest first)
  item.mentionsTrendVals = [];
  item.influenceTrendVals = [];
  item.appearanceOrderTrendVals = [];
  item.uniqueModelCountTrendVals = [];

  // Add current data point first (newest)
  item.mentionsTrendVals.push({ date: currentDate, value: item.mentions || 0 });
  item.influenceTrendVals.push({ date: currentDate, value: item.influence || 0 });
  item.appearanceOrderTrendVals.push({ date: currentDate, value: item.appearanceOrder || -1 });
  item.uniqueModelCountTrendVals.push({ date: currentDate, value: item.uniqueModelCount || 0 });

  // Add previous data points in reverse chronological order
  previousDates.forEach((date, index) => {
    const prevItem = prevItems[index];
    if (prevItem) {
      item.mentionsTrendVals.push({
        date,
        value: prevItem.mentions || 0
      });
      item.influenceTrendVals.push({
        date,
        value: prevItem.influence || 0
      });
      item.appearanceOrderTrendVals.push({
        date,
        value: prevItem.appearanceOrder || -1
      });
      item.uniqueModelCountTrendVals.push({
        date,
        value: prevItem.uniqueModelCount || prevItem.botCount || 0
      });
    }
  });

  // Calculate main trends based on most recent comparison
  const mostRecentPrevItem = prevItems.length > 0 ? prevItems[0] : null;
  item.mentionsTrend = calculateTrend(item.mentions || 0, mostRecentPrevItem?.mentions);
  item.influenceTrend = calculateTrend(item.influence || 0, mostRecentPrevItem?.influence);
  item.appearanceOrderTrend = item.appearanceOrder === -1 ?
    TRENDS.UNKNOWN :
    calculateTrend(item.appearanceOrder || 999, mostRecentPrevItem?.appearanceOrder);
  item.uniqueModelCountTrend = calculateTrend(
    item.uniqueModelCount || 0,
    mostRecentPrevItem?.uniqueModelCount || mostRecentPrevItem?.botCount
  );

  // Initialize per-model trend properties
  item.mentionsByModelTrend = {};
  item.mentionsByModelTrendVals = {};
  item.influenceByModelTrend = {};
  item.influenceByModelTrendVals = {};
  item.appearanceOrderByModelTrend = {};
  item.appearanceOrderByModelTrendVals = {};

  models.forEach((model: any) => {
    const botId = model.id;

    // Initialize trend value arrays
    item.mentionsByModelTrendVals![botId] = [];
    item.influenceByModelTrendVals![botId] = [];
    item.appearanceOrderByModelTrendVals![botId] = [];

    // Add current data point
    item.mentionsByModelTrendVals![botId].push({
      date: currentDate,
      value: (item.mentionsByModel && item.mentionsByModel[botId]) || 0
    });
    item.influenceByModelTrendVals![botId].push({
      date: currentDate,
      value: (item.influenceByModel && item.influenceByModel[botId]) || 0
    });
    item.appearanceOrderByModelTrendVals![botId].push({
      date: currentDate,
      value: (item.appearanceOrderByModel && item.appearanceOrderByModel[botId]) || -1
    });

    // Add previous data points
    previousDates.forEach((date, index) => {
      const prevItem = prevItems[index];
      if (prevItem) {
        item.mentionsByModelTrendVals![botId].push({
          date,
          value: prevItem.mentionsByModel?.[botId] || 0
        });
        item.influenceByModelTrendVals![botId].push({
          date,
          value: prevItem.influenceByModel?.[botId] || 0
        });
        item.appearanceOrderByModelTrendVals![botId].push({
          date,
          value: prevItem.appearanceOrderByModel?.[botId] || -1
        });
      }
    });

    // Calculate trends for this model
    const currentMentions = (item.mentionsByModel && item.mentionsByModel[botId]) || 0;
    const prevMentions = mostRecentPrevItem?.mentionsByModel?.[botId] || 0;
    item.mentionsByModelTrend![botId] = calculateTrend(currentMentions, prevMentions);

    const currentInfluence = (item.influenceByModel && item.influenceByModel[botId]) || 0;
    const prevInfluence = mostRecentPrevItem?.influenceByModel?.[botId] || 0;
    item.influenceByModelTrend![botId] = calculateTrend(currentInfluence, prevInfluence);

    const currentAppearance = (item.appearanceOrderByModel && item.appearanceOrderByModel[botId]) || -1;
    const prevAppearance = mostRecentPrevItem?.appearanceOrderByModel?.[botId] || -1;
    item.appearanceOrderByModelTrend![botId] = currentAppearance === -1 ?
      TRENDS.UNKNOWN :
      calculateTrend(currentAppearance, prevAppearance);
  });

  // Calculate additional trend metrics
  if (mostRecentPrevItem) {
    item.previous_mentions = mostRecentPrevItem.mentions || 0;
    item.mentions_change = (item.mentions || 0) - item.previous_mentions;

    // Calculate percentage change
    if (item.previous_mentions > 0) {
      item.changePercent = Number((item.mentions_change / item.previous_mentions * 100).toFixed(1));
    } else if (item.mentions && item.mentions > 0) {
      item.changePercent = 100; // New item
    } else {
      item.changePercent = 0;
    }
  } else {
    item.previous_mentions = 0;
    item.mentions_change = item.mentions || 0;
    item.changePercent = item.mentions && item.mentions > 0 ? 100 : 0;
  }

  // Build mentions history
  item.mentionsHistory = [{ date: currentDate, mentions: item.mentions || 0 }];
  prevItems.forEach((prevItem, index) => {
    if (prevItem && previousDates[index]) {
      item.mentionsHistory!.push({
        date: previousDates[index],
        mentions: prevItem.mentions || 0
      });
    }
  });

  // Set first/last seen dates
  item.lastSeen = currentDate;
  if (prevItems.length > 0 && previousDates.length > 0) {
    item.firstSeen = previousDates[previousDates.length - 1];
  } else {
    item.firstSeen = currentDate;
  }

  // Calculate volatility (standard deviation of mentions)
  if (item.mentionsHistory && item.mentionsHistory.length > 1) {
    const values = item.mentionsHistory.map(h => h.mentions);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
    item.volatility = Number(Math.sqrt(variance).toFixed(2));
  } else {
    item.volatility = 0;
  }
}

/**
 * Calculate trends for items by comparing with historical data
 */
function calculateTrends(
  items: EnrichedItem[],
  prevDataArrays: any[],
  currentDate: string,
  previousDates: string[],
  models: any[]
): void {
  if (!Array.isArray(items)) return;

  // Create lookup maps for each previous dataset
  const prevMaps: Map<string, any>[] = prevDataArrays.map(prevData => {
    const map = new Map<string, any>();
    if (prevData && Array.isArray(prevData)) {
      for (const it of prevData) {
        const key = (it.value || it.link || it.keyword || it.organization || it.source || '').toLowerCase();
        if (key) map.set(key, it);
      }
    }
    return map;
  });

  // Process each item
  for (const item of items) {
    const itemKey = (item.value || item.link || item.keyword || item.organization || item.source || '').toLowerCase();
    if (!itemKey) continue;

    // Get previous items from all historical data
    const prevItems = prevMaps.map(map => map.get(itemKey)).filter(item => item !== undefined);

    // Initialize trend properties
    initializeTrendProperties(item, prevItems, currentDate, previousDates, models);
  }
}

/**
 * Main function to calculate trends for enriched data
 */
export async function enrichCalculateTrends(project: string, targetDate: string): Promise<void> {
  // Initialize logger
  await logger.initialize(import.meta.url, project);
  logger.info(`Starting trends calculation for project: ${project}${targetDate ? ` for date: ${targetDate}` : ''}`);

  // Load project models
  const projectModels = await loadProjectModelConfigs(project, ModelType.GET_ANSWER); 

  // Get questions
  const questionsDir = QUESTIONS_DIR(project);
  const questionDirs = await fs.readdir(questionsDir, { withFileTypes: true }) as DirentLike[];
  const actualQuestions = questionDirs.filter(d => d.isDirectory() && d.name !== AGGREGATED_DIR_NAME);

  // Start progress tracking
  logger.startProgress(actualQuestions.length, 'questions');

  let processedCount = 0;
  let skippedCount = 0;
  let currentIndex = 0;

  for (const dir of actualQuestions) {
    if (isInterrupted()) {
      logger.info('Operation cancelled by user');
      throw new Error('Operation cancelled');
    }

    currentIndex++;
    logger.updateProgress(currentIndex, `Processing ${dir.name}...`);

    const files = await prepareStepFiles({
      project,
      questionFolder: dir.name,
      date: targetDate,
      stepName: CURRENT_MODULE_NAME
    });

    if (!files.exists) {
      throw createMissingFileError(dir.name, files.inputPath, 'enrich-calculate-trends');
    }

    try {


      const { data, dataKey } = await loadDataJs(files.inputPath);

      const currentDate = files.date;

      // Get previous data files
      const previousFiles = await getPreviousDataFiles(project, dir.name, currentDate, 3);

      // Load previous data (if any)
      let dataArrays: any[] = [];
      let dates: string[] = [];

      if (previousFiles.length === 0) {
        logger.debug(`No previous data for ${dir.name}, initializing trends with current data only`);
      } else {
        const previousData = await loadPreviousData(previousFiles);
        dataArrays = previousData.dataArrays;
        dates = previousData.dates;
      }

      // Process each array type in the data
      for (const arrayType of MAIN_SECTIONS) {
        if (data[arrayType] && Array.isArray(data[arrayType])) {
          // Get previous data for this array type
          const prevDataArrays = dataArrays.map(d => d[arrayType] || []);
          calculateTrends(data[arrayType], prevDataArrays, currentDate, dates, projectModels);
        }
      }

      // Add report metadata before saving
      addReportMetadata(data, dates);

      // Save enriched data back to same file (final output)
      const comment = `// Enrichment complete with trends on ${new Date().toISOString()}`;
      await saveDataJs(files.outputPath, dataKey, data, comment);

      processedCount++;
      logger.updateProgress(currentIndex, `${dir.name} - ✓`);
    } catch (error) {
      // Re-throw critical errors to stop pipeline
      if (error instanceof PipelineCriticalError) {
        logger.error(`Pipeline-stopping error in ${error.questionFolder}: ${error.message}`);
        throw error;
      }

      // Log and continue for other errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error processing ${dir.name}: ${errorMsg}`);
      throw new PipelineCriticalError(
        `Error processing ${dir.name}: ${errorMsg}`, 
        CURRENT_MODULE_NAME, 
        project
      );
    }
  }

  // Complete progress
  logger.completeProgress(`Processed ${processedCount} questions`);
  logger.info(`Trends calculation complete. Processed: ${processedCount}, Skipped: ${skippedCount}`);
  await logger.showSummary();
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
 await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);  

  await enrichCalculateTrends(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
