import { promises as fs } from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';
import { colorize, writeFileAtomic } from './misc-utils.js';
import { MAIN_SECTIONS } from '../config/constants-entities.js';
import { getUserProjectQuestionsDir, getUserProjectReportsDir } from '../config/user-paths.js';
import { ProgressTracker } from './compact-logger.js';
import { PipelineCriticalError } from './pipeline-errors.js';
import { logger } from './compact-logger.js';



const __dirname = dirname(fileURLToPath(import.meta.url));

interface TrendData {
  date: string;
  mentions: number;
  weightedInfluence?: number;
  appearanceOrder?: number;
}

interface ItemTrend {
  name: string;
  type: string;
  firstSeen: string;
  lastSeen: string;
  totalMentions: number;
  averageMentions: number;
  peakMentions: number;
  peakDate: string;
  trend: 'rising' | 'falling' | 'stable' | 'volatile';
  trendScore: number; // -1 to 1, where -1 is falling, 0 is stable, 1 is rising
  history: TrendData[];
  modelBreakdown: { [modelId: string]: number };
}

interface TrendReport {
  project: string;
  dateRange: { start: string; end: string };
  totalReports: number;
  topRising: ItemTrend[];
  topFalling: ItemTrend[];
  mostVolatile: ItemTrend[];
  mostStable: ItemTrend[];
  newEntrants: ItemTrend[];
  disappeared: ItemTrend[];
  byCategory: {
    [category: string]: {
      items: ItemTrend[];
      totalItems: number;
      averageGrowth: number;
    }
  };
}

async function loadDataFile(filePath: string): Promise<any> {
  const content = await fs.readFile(filePath, 'utf-8');
  const context: any = { window: {} };
  vm.runInNewContext(content, context);
  const key = Object.keys(context.window)[0];
  return context.window[key];
}

export async function findAllReports(project: string): Promise<{ date: string; path: string }[]> {
  const reports: { date: string; path: string }[] = [];
  
  // Look in each question folder's data-compiled directory
  const questionsDir = path.join(getUserProjectQuestionsDir(project), 'questions');
  const questionFolders = await fs.readdir(questionsDir).catch(() => []);
  
  for (const questionFolder of questionFolders) {
    if (!questionFolder.startsWith('prompt')) continue;
    
    const compiledDir = path.join(getUserProjectReportsDir(project), questionFolder, 'data-compiled');
    const files = await fs.readdir(compiledDir).catch(() => []);
    
    // Find enriched data files (not .PROMPT or .PROMPT-COMPILED)
    const dataFiles = files.filter(f => 
      f.match(/^\d{4}-\d{2}-\d{2}-data\.js$/) &&
      !f.includes('.PROMPT')
    );
    
    for (const file of dataFiles) {
      const date = file.slice(0, 10); // Extract YYYY-MM-DD
      reports.push({
        date,
        path: path.join(compiledDir, file)
      });
    }
  }
  
  // Sort by date
  reports.sort((a, b) => a.date.localeCompare(b.date));
  return reports;
}

function calculateTrendScore(history: TrendData[]): number {
  if (history.length < 2) return 0;
  
  // Calculate linear regression slope
  const n = history.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  history.forEach((point, index) => {
    sumX += index;
    sumY += point.mentions;
    sumXY += index * point.mentions;
    sumX2 += index * index;
  });
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgMentions = sumY / n;
  
  // Normalize slope relative to average mentions
  const normalizedSlope = avgMentions > 0 ? slope / avgMentions : 0;
  
  // Clamp to -1 to 1 range
  return Math.max(-1, Math.min(1, normalizedSlope));
}

function determineTrend(trendScore: number, history: TrendData[]): 'rising' | 'falling' | 'stable' | 'volatile' {
  // Calculate volatility (standard deviation)
  if (history.length < 2) return 'stable';
  
  const avg = history.reduce((sum, h) => sum + h.mentions, 0) / history.length;
  const variance = history.reduce((sum, h) => sum + Math.pow(h.mentions - avg, 2), 0) / history.length;
  const stdDev = Math.sqrt(variance);
  const volatility = avg > 0 ? stdDev / avg : 0;
  
  if (volatility > 0.5) return 'volatile';
  if (trendScore > 0.2) return 'rising';
  if (trendScore < -0.2) return 'falling';
  return 'stable';
}

async function aggregateItemTrends(
  project: string,
  startDate?: string,
  endDate?: string
): Promise<Map<string, ItemTrend>> {
  const reports = await findAllReports(project);
  const filteredReports = reports.filter(r => {
    if (startDate && r.date < startDate) return false;
    if (endDate && r.date > endDate) return false;
    return true;
  });
  
  if (filteredReports.length === 0) {
    throw new Error('No reports found in the specified date range');
  }
  
  const itemTrends = new Map<string, ItemTrend>();
  const tracker = new ProgressTracker(filteredReports.length, 'reports');
  tracker.start(`Analyzing trends for ${project}`);
  
  let reportIndex = 0;
  for (const report of filteredReports) {
    reportIndex++;
    tracker.update(reportIndex, `Processing ${report.date}`);
    
    try {
      const data = await loadDataFile(report.path);
      const categories = [...MAIN_SECTIONS];

      for (const category of categories) {
        if (!data[category] || !Array.isArray(data[category])) continue;
        
        for (const item of data[category]) {
          const itemKey = `${category}:${item.value || item.link || item.keyword || item.organization || item.source || ''}`;
          if (!itemKey.split(':')[1]) continue;
          
          let trend = itemTrends.get(itemKey);
          if (!trend) {
            trend = {
              name: item.value || item.link || item.keyword || item.organization || item.source || '',
              type: category,
              firstSeen: report.date,
              lastSeen: report.date,
              totalMentions: 0,
              averageMentions: 0,
              peakMentions: 0,
              peakDate: report.date,
              trend: 'stable',
              trendScore: 0,
              history: [],
              modelBreakdown: {}
            };
            itemTrends.set(itemKey, trend);
          }
          
          const mentions = item.mentions || 0;
          const weightedInfluence = item.weightedInfluence || 0;
          const appearanceOrder = item.appearanceOrder || -1;
          
          trend.history.push({
            date: report.date,
            mentions,
            weightedInfluence,
            appearanceOrder
          });
          
          trend.lastSeen = report.date;
          trend.totalMentions += mentions;
          
          if (mentions > trend.peakMentions) {
            trend.peakMentions = mentions;
            trend.peakDate = report.date;
          }
          
          // Update model breakdown
          if (item.mentionsByModel) {
            for (const [modelId, modelMentions] of Object.entries(item.mentionsByModel)) {
              trend.modelBreakdown[modelId] = (trend.modelBreakdown[modelId] || 0) + (modelMentions as number);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to process report ${report.date}: ${error}`);
      throw new PipelineCriticalError(`Failed to process report ${report.date}: ${error}`, 'aggregateItemTrends', project);
    }
  }
  
  // Calculate final statistics for each item
  for (const trend of itemTrends.values()) {
    trend.averageMentions = trend.history.length > 0 ? trend.totalMentions / trend.history.length : 0;
    trend.trendScore = calculateTrendScore(trend.history);
    trend.trend = determineTrend(trend.trendScore, trend.history);
  }
  
  tracker.complete(`Analyzed ${itemTrends.size} unique items across ${filteredReports.length} reports`);
  return itemTrends;
}

export async function generateTrendReport(
  project: string,
  options: {
    startDate?: string;
    endDate?: string;
    topN?: number;
  } = {}
): Promise<TrendReport> {
  const { startDate, endDate, topN = 10 } = options;
  
  logger.info(`Generating trend report for ${project}`);
  if (startDate) logger.info(`Start date: ${startDate}`);
  if (endDate) logger.info(`End date: ${endDate}`);
  
  const itemTrends = await aggregateItemTrends(project, startDate, endDate);
  const allTrends = Array.from(itemTrends.values());
  const reports = await findAllReports(project);
  const filteredReports = reports.filter(r => {
    if (startDate && r.date < startDate) return false;
    if (endDate && r.date > endDate) return false;
    return true;
  });
  
  // Find date range
  const dates = filteredReports.map(r => r.date);
  const dateRange = {
    start: dates[0] || '',
    end: dates[dates.length - 1] || ''
  };
  
  // Sort by different criteria
  const topRising = allTrends
    .filter(t => t.trend === 'rising')
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, topN);
  
  const topFalling = allTrends
    .filter(t => t.trend === 'falling')
    .sort((a, b) => a.trendScore - b.trendScore)
    .slice(0, topN);
  
  const mostVolatile = allTrends
    .filter(t => t.trend === 'volatile')
    .sort((a, b) => {
      // Calculate volatility score
      const aVol = calculateVolatility(a.history);
      const bVol = calculateVolatility(b.history);
      return bVol - aVol;
    })
    .slice(0, topN);
  
  const mostStable = allTrends
    .filter(t => t.trend === 'stable' && t.averageMentions > 0)
    .sort((a, b) => b.averageMentions - a.averageMentions)
    .slice(0, topN);
  
  // Find new entrants (first seen in last 25% of date range)
  const recentThreshold = dates[Math.floor(dates.length * 0.75)] || dateRange.end;
  const newEntrants = allTrends
    .filter(t => t.firstSeen >= recentThreshold)
    .sort((a, b) => b.averageMentions - a.averageMentions)
    .slice(0, topN);
  
  // Find disappeared items (last seen in first 75% of date range)
  const disappearedThreshold = dates[Math.floor(dates.length * 0.75)] || dateRange.start;
  const disappeared = allTrends
    .filter(t => t.lastSeen < disappearedThreshold)
    .sort((a, b) => b.averageMentions - a.averageMentions)
    .slice(0, topN);
  
  // Group by category
  const byCategory: TrendReport['byCategory'] = {};
  for (const trend of allTrends) {
    if (!byCategory[trend.type]) {
      byCategory[trend.type] = {
        items: [],
        totalItems: 0,
        averageGrowth: 0
      };
    }
    byCategory[trend.type].items.push(trend);
  }
  
  // Calculate category statistics
  for (const category of Object.values(byCategory)) {
    category.totalItems = category.items.length;
    category.averageGrowth = category.items.reduce((sum, item) => sum + item.trendScore, 0) / category.items.length;
    // Sort items by total mentions
    category.items.sort((a, b) => b.totalMentions - a.totalMentions);
  }
  
  return {
    project,
    dateRange,
    totalReports: filteredReports.length,
    topRising,
    topFalling,
    mostVolatile,
    mostStable,
    newEntrants,
    disappeared,
    byCategory
  };
}

function calculateVolatility(history: TrendData[]): number {
  if (history.length < 2) return 0;
  
  const mentions = history.map(h => h.mentions);
  const avg = mentions.reduce((sum, m) => sum + m, 0) / mentions.length;
  const variance = mentions.reduce((sum, m) => sum + Math.pow(m - avg, 2), 0) / mentions.length;
  const stdDev = Math.sqrt(variance);
  
  return avg > 0 ? stdDev / avg : 0;
}

export async function exportTrendData(
  project: string,
  outputPath: string,
  options: {
    startDate?: string;
    endDate?: string;
    format?: 'json' | 'csv';
  } = {}
): Promise<void> {
  const { format = 'json' } = options;
  const report = await generateTrendReport(project, options);
  
  if (format === 'json') {
    await writeFileAtomic(outputPath, JSON.stringify(report, null, 2));
    logger.success(`Trend data exported to ${outputPath}`);
  } else if (format === 'csv') {
    // Export as CSV with multiple sheets
    const csvDir = outputPath.replace(/\.csv$/, '');
    
    // Export summary
    const summaryPath = path.join(csvDir, 'summary.csv');
    const summaryCSV = [
      'Metric,Value',
      `Project,${report.project}`,
      `Date Range,${report.dateRange.start} to ${report.dateRange.end}`,
      `Total Reports,${report.totalReports}`,
      `Total Items Tracked,${Object.values(report.byCategory).reduce((sum, cat) => sum + cat.totalItems, 0)}`
    ].join('\n');
    await writeFileAtomic(summaryPath, summaryCSV);
    
    // Export each category
    for (const [categoryName, category] of Object.entries(report.byCategory)) {
      const categoryPath = path.join(csvDir, `${categoryName}.csv`);
      const headers = ['Name', 'First Seen', 'Last Seen', 'Total Mentions', 'Average Mentions', 'Peak Mentions', 'Peak Date', 'Trend', 'Trend Score'];
      const rows = category.items.map(item => [
        item.name,
        item.firstSeen,
        item.lastSeen,
        item.totalMentions,
        item.averageMentions.toFixed(2),
        item.peakMentions,
        item.peakDate,
        item.trend,
        item.trendScore.toFixed(3)
      ]);
      
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      await writeFileAtomic(categoryPath, csv);
    }
    
    logger.success(`Trend data exported to ${csvDir}/`);
  }
}

export async function compareDates(
  project: string,
  date1: string,
  date2: string
): Promise<void> {
  logger.info(`Comparing ${date1} vs ${date2} for project ${project}`);
  
  const reports = await findAllReports(project);
  const report1 = reports.find(r => r.date === date1);
  const report2 = reports.find(r => r.date === date2);
  
  if (!report1) throw new Error(`No report found for date ${date1}`);
  if (!report2) throw new Error(`No report found for date ${date2}`);
  
  const data1 = await loadDataFile(report1.path);
  const data2 = await loadDataFile(report2.path);
  
  logger.info(colorize('\n📊 Comparison Report', 'bright'));
  logger.info(colorize(`${date1} → ${date2}`, 'cyan'));
  logger.info('');

  const categories = [...MAIN_SECTIONS];

  for (const category of categories) {
    const items1 = new Map((data1[category] || []).map((item: any) => {
      const key = item.value || item.link || item.keyword || item.organization || item.source || '';
      return [key.toLowerCase(), item];
    }));
    
    const items2 = new Map((data2[category] || []).map((item: any) => {
      const key = item.value || item.link || item.keyword || item.organization || item.source || '';
      return [key.toLowerCase(), item];
    }));
    
    const newItems = Array.from(items2.keys()).filter(k => !items1.has(k));
    const removedItems = Array.from(items1.keys()).filter(k => !items2.has(k));
    
    const changes: Array<{ name: string; change: number; trend: string }> = [];
    
    for (const [key, item2] of items2.entries()) {
      const item1 = items1.get(key);
      if (item1) {
        const change = ((item2 as any).mentions || 0) - ((item1 as any).mentions || 0);
        if (change !== 0) {
          changes.push({
            name: (item2 as any).value || (item2 as any).link || (item2 as any).keyword || (item2 as any).organization || (item2 as any).source || '',
            change,
            trend: change > 0 ? '↑' : '↓'
          });
        }
      }
    }
    
    // Sort by absolute change
    changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    
    if (newItems.length > 0 || removedItems.length > 0 || changes.length > 0) {
      logger.info(colorize(`\n${category.toUpperCase()}`, 'yellow'));
      
      if (newItems.length > 0) {
        logger.info(colorize('  New:', 'green'));
        newItems.slice(0, 5).forEach(key => {
          const item = items2.get(key) as any;
          logger.info(`    + ${item.value || item.link || item.keyword || item.organization || item.source}`);
        });
        if (newItems.length > 5) logger.info(`    ... and ${newItems.length - 5} more`);
      }
      
      if (removedItems.length > 0) {
        logger.info(colorize('  Removed:', 'red'));
        removedItems.slice(0, 5).forEach(key => {
          const item = items1.get(key) as any;
          logger.info(`    - ${item.value || item.link || item.keyword || item.organization || item.source}`);
        });
        if (removedItems.length > 5) logger.info(`    ... and ${removedItems.length - 5} more`);
      }
      
      if (changes.length > 0) {
        logger.info(colorize('  Top Changes:', 'cyan'));
        changes.slice(0, 5).forEach(({ name, change, trend }) => {
          const changeStr = change > 0 ? `+${change}` : `${change}`;
          logger.info(`    ${trend} ${name} (${changeStr} mentions)`);
        });
        if (changes.length > 5) logger.info(`    ... and ${changes.length - 5} more changes`);
      }
    }
  }
}
