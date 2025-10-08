import { compareDates, generateTrendReport, exportTrendData } from '../utils/trends-calculation.js';
import { colorize } from '../utils/misc-utils.js';
import { logger } from '../utils/compact-logger.js';

async function printUsage(): Promise<void> {
  logger.info(colorize('\nUsage:', 'yellow'));
  logger.info('  aicw compare <ProjectName> <date1> <date2>');
  logger.info('  aicw compare <ProjectName> trends [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--export path]');
  logger.info('  aicw compare <ProjectName> history [--last N]');
  logger.info('');
  logger.info(colorize('Examples:', 'yellow'));
  logger.info('  # Compare two specific dates');
  logger.info('  aicw compare MyProject 2024-01-01 2024-02-01');
  logger.info('');
  logger.info('  # Generate trend report for all time');
  logger.info('  aicw compare MyProject trends');
  logger.info('');
  logger.info('  # Generate trend report for date range');
  logger.info('  aicw compare MyProject trends --start 2024-01-01 --end 2024-03-31');
  logger.info('');
  logger.info('  # Export trend data');
  logger.info('  aicw compare MyProject trends --export trends.json');
  logger.info('  aicw compare MyProject trends --export trends.csv --format csv');
  logger.info('');
  logger.info('  # Show history of reports');
  logger.info('  aicw compare MyProject history');
  logger.info('  aicw compare MyProject history --last 10');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    await printUsage();
    process.exit(1);
  }
  
  const [project, command, ...options] = args;
  
  try {
    if (command === 'trends') {
      // Parse options
      const opts: any = {};
      for (let i = 0; i < options.length; i++) {
        if (options[i] === '--start' && options[i + 1]) {
          opts.startDate = options[i + 1];
          i++;
        } else if (options[i] === '--end' && options[i + 1]) {
          opts.endDate = options[i + 1];
          i++;
        } else if (options[i] === '--export' && options[i + 1]) {
          opts.exportPath = options[i + 1];
          i++;
        } else if (options[i] === '--format' && options[i + 1]) {
          opts.format = options[i + 1];
          i++;
        }
      }
      
      const report = await generateTrendReport(project, opts);
      
      // Print summary
      logger.info(colorize('\n📈 Trend Analysis Report', 'bright'));
      logger.info(colorize(`Project: ${report.project}`, 'cyan'));
      logger.info(colorize(`Period: ${report.dateRange.start} to ${report.dateRange.end}`, 'dim'));
      logger.info(colorize(`Total reports analyzed: ${report.totalReports}`, 'dim'));
      logger.info('');
      
      // Top Rising
      if (report.topRising.length > 0) {
        logger.info(colorize('🚀 Top Rising Items:', 'green'));
        report.topRising.slice(0, 5).forEach(item => {
          const growth = (item.trendScore * 100).toFixed(1);
          logger.info(`  ↑ ${item.name} (${item.type}) +${growth}% trend`);
          logger.info(`    Mentions: ${item.history[0]?.mentions || 0} → ${item.history[item.history.length - 1]?.mentions || 0}`);
        });
        logger.info('');
      }
      
      // Top Falling
      if (report.topFalling.length > 0) {
        logger.info(colorize('📉 Top Falling Items:', 'red'));
        report.topFalling.slice(0, 5).forEach(item => {
          const decline = (item.trendScore * 100).toFixed(1);
          logger.info(`  ↓ ${item.name} (${item.type}) ${decline}% trend`);
          logger.info(`    Mentions: ${item.history[0]?.mentions || 0} → ${item.history[item.history.length - 1]?.mentions || 0}`);
        });
        logger.info('');
      }
      
      // New Entrants
      if (report.newEntrants.length > 0) {
        logger.info(colorize('✨ New Entrants:', 'yellow'));
        report.newEntrants.slice(0, 5).forEach(item => {
          logger.info(`  • ${item.name} (${item.type}) - First seen: ${item.firstSeen}`);
          logger.info(`    Average mentions: ${item.averageMentions.toFixed(1)}`);
        });
        logger.info('');
      }
      
      // Category Summary
      logger.info(colorize('📊 Category Summary:', 'blue'));
      for (const [category, data] of Object.entries(report.byCategory)) {
        const growth = data.averageGrowth > 0 ? '+' : '';
        logger.info(`  ${category}: ${data.totalItems} items (${growth}${(data.averageGrowth * 100).toFixed(1)}% avg trend)`);
      }
      
      // Export if requested
      if (opts.exportPath) {
        await exportTrendData(project, opts.exportPath, { ...opts, format: opts.format || 'json' });
      }
      
    } else if (command === 'history') {
      // Show history of reports
      const { findAllReports } = await import('../utils/trends-calculation.js');
      const reports = await findAllReports(project);
      
      const lastN = options.find(o => o === '--last') 
        ? parseInt(options[options.indexOf('--last') + 1]) || reports.length
        : reports.length;
        
      const reportsToShow = reports.slice(-lastN);
      
      logger.info(colorize(`\n📅 Report History for ${project}`, 'bright'));
      logger.info(colorize(`Showing last ${reportsToShow.length} of ${reports.length} reports`, 'dim'));
      logger.info('');
      
      const dateGroups = new Map<string, number>();
      reportsToShow.forEach(r => {
        const yearMonth = r.date.slice(0, 7);
        dateGroups.set(yearMonth, (dateGroups.get(yearMonth) || 0) + 1);
      });
      
      for (const [yearMonth, count] of dateGroups.entries()) {
        logger.info(colorize(`${yearMonth}:`, 'yellow'));
        const monthReports = reportsToShow.filter(r => r.date.startsWith(yearMonth));
        monthReports.forEach(r => {
          logger.info(`  • ${r.date}`);
        });
      }
      
      if (reports.length > 1) {
        logger.info('');
        logger.info(colorize('Compare specific dates:', 'dim'));
        logger.info(`  aicw compare ${project} ${reports[0].date} ${reports[reports.length - 1].date}`);
      }
      
    } else if (command.match(/^\d{4}-\d{2}-\d{2}$/) && options[0]?.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Compare two dates
      await compareDates(project, command, options[0]);
      
    } else {
      await printUsage();
      process.exit(1);
    }
    
  } catch (error) {
    logger.error(`Error: ${error}`);
    process.exit(1);
  }
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
