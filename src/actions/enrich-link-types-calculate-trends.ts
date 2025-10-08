import { promises as fs } from 'fs';
import path from 'path';
import { DirentLike } from '../config/types.js';
import { QUESTION_DATA_COMPILED_DATE_DIR } from '../config/paths.js';
import { waitForEnterInInteractiveMode } from '../utils/misc-utils.js';
import { logger } from '../utils/compact-logger.js';
import { loadProjectModelConfigs } from '../utils/project-utils.js';
import { readQuestions } from '../utils/project-utils.js';
import {prepareStepFiles} from '../utils/enrich-data-utils.js';
import { loadDataJs, saveDataJs } from '../utils/project-utils.js';
import { PipelineCriticalError, createMissingFileError, createMissingDataError } from '../utils/pipeline-errors.js';
import { getTargetDateFromProjectOrEnvironment, validateAndLoadProject } from '../utils/project-utils.js';
import { getProjectNameFromCommandLine } from '../utils/project-utils.js';
import { ModelType } from '../utils/project-utils.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);


// Trend indicators - EXTRACTED FROM OLD WORKING CODE
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
 * EXTRACTED FROM OLD WORKING CODE
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
 * Get previous data files for trends analysis
 */
async function getPreviousLinkTypesFiles(project: string, questionFolder: string, currentDate: string, maxFiles: number = 3): Promise<string[]> {
  const dataDir = QUESTION_DATA_COMPILED_DATE_DIR(project, questionFolder, '');

  try {
    const dirs: DirentLike[] = await fs.readdir(path.dirname(dataDir), { withFileTypes: true }) as DirentLike[];
    const dateDirs = dirs
      .filter(dir => dir.isDirectory() && dir.name.match(/^\d{4}-\d{2}-\d{2}$/))
      .map(dir => dir.name)
      .filter(date => date < currentDate)
      .sort((a, b) => b.localeCompare(a)) // Most recent first
      .slice(0, maxFiles);

    const files: string[] = [];
    for (const date of dateDirs) {
      const filePath = path.join(
        QUESTION_DATA_COMPILED_DATE_DIR(project, questionFolder, date),
        `${date}-data.js`
      );
      try {
        await fs.access(filePath);
        files.push(filePath);
      } catch {
        // File doesn't exist, skip
      }
    }

    return files;
  } catch {
    return [];
  }
}

/**
 * Initialize trend properties for linkTypes item
 * EXTRACTED FROM OLD WORKING CODE
 */
function initializeTrendProperties(
  item: any,
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
    item.mentionsByModelTrendVals[botId] = [];
    item.influenceByModelTrendVals[botId] = [];
    item.appearanceOrderByModelTrendVals[botId] = [];

    // Add current data point
    item.mentionsByModelTrendVals[botId].push({
      date: currentDate,
      value: (item.mentionsByModel && item.mentionsByModel[botId]) || 0
    });
    item.influenceByModelTrendVals[botId].push({
      date: currentDate,
      value: (item.influenceByModel && item.influenceByModel[botId]) || 0
    });
    item.appearanceOrderByModelTrendVals[botId].push({
      date: currentDate,
      value: (item.appearanceOrderByModel && item.appearanceOrderByModel[botId]) || -1
    });

    // Add previous data points
    previousDates.forEach((date, index) => {
      const prevItem = prevItems[index];
      if (prevItem) {
        item.mentionsByModelTrendVals[botId].push({
          date,
          value: prevItem.mentionsByModel?.[botId] || 0
        });
        item.influenceByModelTrendVals[botId].push({
          date,
          value: prevItem.influenceByModel?.[botId] || 0
        });
        item.appearanceOrderByModelTrendVals[botId].push({
          date,
          value: prevItem.appearanceOrderByModel?.[botId] || -1
        });
      }
    });

    // Calculate trends for this model
    const currentMentions = (item.mentionsByModel && item.mentionsByModel[botId]) || 0;
    const prevMentions = mostRecentPrevItem?.mentionsByModel?.[botId] || 0;
    item.mentionsByModelTrend[botId] = calculateTrend(currentMentions, prevMentions);

    const currentInfluence = (item.influenceByModel && item.influenceByModel[botId]) || 0;
    const prevInfluence = mostRecentPrevItem?.influenceByModel?.[botId] || 0;
    item.influenceByModelTrend[botId] = calculateTrend(currentInfluence, prevInfluence);

    const currentAppearance = (item.appearanceOrderByModel && item.appearanceOrderByModel[botId]) || -1;
    const prevAppearance = mostRecentPrevItem?.appearanceOrderByModel?.[botId] || -1;
    item.appearanceOrderByModelTrend[botId] = currentAppearance === -1 ?
      TRENDS.UNKNOWN :
      calculateTrend(currentAppearance, prevAppearance);
  });

  // Calculate additional trend metrics - EXTRACTED FROM OLD WORKING CODE
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

  // Build mentions history - EXTRACTED FROM OLD WORKING CODE
  item.mentionsHistory = [{ date: currentDate, mentions: item.mentions || 0 }];
  prevItems.forEach((prevItem, index) => {
    if (prevItem && previousDates[index]) {
      item.mentionsHistory.push({
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
    const values = item.mentionsHistory.map((h: any) => h.mentions);
    const mean = values.reduce((sum: number, v: number) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v: number) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((sum: number, v: number) => sum + v, 0) / values.length;
    item.volatility = Number(Math.sqrt(variance).toFixed(2));
  } else {
    item.volatility = 0;
  }
}

/**
 * Calculate trends for linkTypes by comparing with historical data
 * Extracted from old aggregateLinkTypes function - Phase 4 (trends only)
 */
function calculateTrendsForLinkTypes(
  linkTypes: any[],
  prevLinkTypesArrays: any[][],
  currentDate: string,
  previousDates: string[],
  models: any[]
): void {
  logger.debug('Calculating trends for linkTypes');

  // Create lookup maps for each previous dataset - EXTRACTED FROM OLD WORKING CODE
  const prevMaps: Map<string, any>[] = prevLinkTypesArrays.map(prevLinkTypes => {
    const map = new Map<string, any>();
    if (prevLinkTypes && Array.isArray(prevLinkTypes)) {
      for (const linkType of prevLinkTypes) {
        // Match by code first, then by value - EXTRACTED FROM OLD WORKING CODE
        const key = linkType.code || linkType.value?.toLowerCase() || '';
        if (key) map.set(key, linkType);
      }
    }
    return map;
  });

  // Process each linkType - EXTRACTED FROM OLD WORKING CODE
  for (const linkType of linkTypes) {
    const itemKey = linkType.code || linkType.value?.toLowerCase() || '';
    if (!itemKey) continue;

    // Get previous items from all historical data - EXTRACTED FROM OLD WORKING CODE
    const prevItems = prevMaps.map(map => map.get(itemKey)).filter(item => item !== undefined);

    // Initialize trend properties - EXTRACTED FROM OLD WORKING CODE
    initializeTrendProperties(linkType, prevItems, currentDate, previousDates, models);

    // Clean up temporary properties now that we're done with aggregation - EXTRACTED FROM OLD WORKING CODE
    delete linkType.sources;
  }

  logger.debug(`Calculated trends for ${linkTypes.length} link types`);
}

/**
 * Main function to calculate trends for linkTypes (EE only)
 */
export async function enrichLinkTypesCalculateTrends(project: string, targetDate: string): Promise<void> {
  // Initialize logger
  await logger.initialize(import.meta.url, project);

  logger.info(`Starting linkTypes trends calculation for project: ${project}`);

  // Load project models
  const projectModels = await loadProjectModelConfigs(project, ModelType.GET_ANSWER);

  const questions = await readQuestions(project);


  logger.info(`Processing ${questions.length} questions for date: ${targetDate}`);

  // Start progress tracking
  logger.startProgress(questions.length, 'questions');

  let processedCount = 0;
  let skippedCount = 0;

  for (const [index, question] of questions.entries()) {
    const currentIndex = index + 1;
    logger.updateProgress(currentIndex, `Calculating trends for ${question.folder}...`);

    const files = await prepareStepFiles({
      project,
      questionFolder: question.folder,
      date: targetDate,
      stepName: CURRENT_MODULE_NAME
    });

    if (!files.exists) {
      throw createMissingFileError(question.folder, files.inputPath, 'enrich-link-types-calculate-trends');
    }

    try {


      const { data, dataKey } = await loadDataJs(files.inputPath);

      // Check if linkTypes exist - CRITICAL: must be created by previous modules
      if (!data.linkTypes || !Array.isArray(data.linkTypes) || data.linkTypes.length === 0) {
        throw createMissingDataError(question.folder, 'linkTypes', 'previous link-types step', 'enrich-link-types-calculate-trends');
      }

      // Get previous data files for trends analysis
      const previousFiles = await getPreviousLinkTypesFiles(project, question.folder, targetDate, 3);

      // Load previous linkTypes data (if any)
      const prevLinkTypesArrays: any[][] = [];
      const dates: string[] = [];

      if (previousFiles.length === 0) {
        logger.debug(`No previous data for ${question.folder}, initializing trends with current data only`);
      } else {
        for (const file of previousFiles) {
          try {
            const { data: prevData } = await loadDataJs(file);
            if (prevData.linkTypes && Array.isArray(prevData.linkTypes)) {
              prevLinkTypesArrays.push(prevData.linkTypes);

              // Extract date from filename
              const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})-data\.js/);
              if (dateMatch) {
                dates.push(dateMatch[1]);
              }
            }
          } catch (error) {
            logger.debug(`Could not load previous linkTypes data from ${file}: ${error}`);
          }
        }
      }

      // Calculate trends for linkTypes
      calculateTrendsForLinkTypes(data.linkTypes, prevLinkTypesArrays, targetDate, dates, projectModels);

      // Save updated data
      await saveDataJs(files.outputPath, dataKey, data);

      processedCount++;

      logger.updateProgress(currentIndex, `${question.folder} - ✓ ${data.linkTypes.length} types`);
      logger.info(`Calculated trends for ${data.linkTypes.length} link types for ${question.folder}`);

    } catch (error) {
      // Re-throw critical errors to stop pipeline
      if (error instanceof PipelineCriticalError) {
        logger.error(`Pipeline-stopping error in ${error.questionFolder}: ${error.message}`);
        throw error;
      }

      // Log and continue for other errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to process ${question.folder}: ${errorMsg}`);
      skippedCount++;
      continue;
    }
  }

  // Complete progress
  logger.completeProgress(`Processed ${processedCount} questions`);

  // Add summary stats
  logger.addStat('Processed', processedCount);
  logger.addStat('Skipped', skippedCount);

  logger.info(`LinkTypes trends calculation complete. Processed: ${processedCount}, Skipped: ${skippedCount}`);
  await logger.showSummary();
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
 await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);  

  await enrichLinkTypesCalculateTrends(project, targetDate);

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
