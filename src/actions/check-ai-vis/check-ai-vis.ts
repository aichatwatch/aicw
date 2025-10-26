/**
 * Check AI Visibility Action
 *
 * Verifies if a website is accessible and properly indexed by AI crawlers.
 * Runs multiple checks and displays a weighted score report.
 */

import { createInterface } from 'readline';
import { logger } from '../../utils/compact-logger.js';
import { colorize, waitForEnterInInteractiveMode, WaitForEnterMessageType } from '../../utils/misc-utils.js';
import { interruptibleDelay as delay } from '../../utils/delay.js';
import { AI_VISIBILITY_CHECK_DELAY_MS } from '../../config/constants.js';
import { callHttpWithRetry } from '../../utils/http-caller.js';
import { DEFAULT_BROWSER_HEADERS, DESKTOP_BROWSER_USER_AGENT, MOBILE_BROWSER_USER_AGENT } from '../../config/ai-user-agents.js';
// sub actions
import { BaseVisibilityCheck, PageCaptured, VisibilityCheckResult } from './sub/check-base.js';
import { ServerBaseBotAccessibilityCheck } from './sub/check-server-bot-accessibility-base.js';
import { CheckContentJsonLD } from './sub/check-content-json-ld.js';
import { CheckContentMetaTags } from './sub/check-content-meta-tags.js';
import { CheckServerHttpHeaders } from './sub/check-server-http-headers.js';
import { ServerBotAcessibilityFoundationModelsTraining } from './sub/check-server-bot-accessibility-foundations.js';
import { ServerBotAcessibilitySearchIndex } from './sub/check-server-bot-accessibility-search.js';
import { ServerBotAcessibilityUserInteraction } from './sub/check-server-bot-accessibility-user-interaction.js';
import { CheckServerRobotsTxt } from './sub/check-server-robots-txt.js';
import { CheckServerSitemap } from './sub/check-server-sitemap.js';
import { ContentLlmsTxtFile as CheckContentLlmsTxtFile } from './sub/check-content-llms-txt.js';
import { CheckIndexingDatasetCommonCrawl } from './sub/check-indexing-dataset-common-crawl.js';
import { CheckContentJavaScriptDependency } from './sub/check-content-javascript-dependency.js';
import { CheckContentMobileCompatibility } from './sub/check-content-mobile-compatibility.js';
import { CheckContentStructure } from './sub/check-content-structure.js'; 
import { getUniqueAIProducts } from './utils/ai-product-utils.js';
import { CheckResponseSpeed } from './sub/check-response-speed.js';

/**
 * Configuration for a visibility check with its weighted score
 */
export interface VisibilityCheckConfig {
  CheckClass: new () => BaseVisibilityCheck;
  maxScore: number;
}

/**
 * Weighted visibility checks configuration
 *
 * Score Distribution:
 * - Critical Blockers (60 points): Can completely block AI access
 * - Important Checks (35 points): Significant impact on visibility
 * - Helpful Checks (13 points): Improves discoverability/understanding
 * - Optional Checks (1 point): Emerging standards/informational
 *
 * Total: 109 points
 */
export const VISIBILITY_CHECKS: VisibilityCheckConfig[] = [
  // Critical Blockers (60 points total)
  { CheckClass: CheckServerRobotsTxt, maxScore: 15 },           // Protocol-level bot blocking
  { CheckClass: CheckServerSitemap, maxScore: 5 },              // Aids discovery
  { CheckClass: CheckServerHttpHeaders, maxScore: 15 },         // HTTP header blocking (X-Robots-Tag)
  { CheckClass: CheckResponseSpeed, maxScore: 7 },        // Crawl efficiency

  // Content Checks (35 points total)
  { CheckClass: CheckContentJsonLD, maxScore: 5 },               // Structured data
  { CheckClass: CheckContentMetaTags, maxScore: 8 },             // HTML meta tag blocking
  { CheckClass: CheckContentJavaScriptDependency, maxScore: 8 }, // Content accessibility
  { CheckClass: CheckContentStructure, maxScore: 5 },     // AI-optimized content structure
  { CheckClass: CheckContentMobileCompatibility, maxScore: 7 },  // Mobile-first indexing
  // Optional Checks (1 point total)
  { CheckClass: CheckContentLlmsTxtFile, maxScore: 1 },              // emerhing but not widely used standard


  // Bot accessibility split by type (30 points total)
  { CheckClass: ServerBotAcessibilityFoundationModelsTraining, maxScore: 12 }, // Foundation model training (6 bots)
  { CheckClass: ServerBotAcessibilitySearchIndex, maxScore: 10 },     // Search indexing (6 bots)
  { CheckClass: ServerBotAcessibilityUserInteraction, maxScore: 8 },        // User interactions (8 bots)


  // Helpful Checks (13 points total)
  { CheckClass: CheckIndexingDatasetCommonCrawl, maxScore: 3 },          // Historical presence


  // Search engine indexing checks (commented out - informational only)
  // { CheckClass: CheckGoogleIndexing, maxScore: 1 },
  // { CheckClass: CheckBingIndexing, maxScore: 1 },
  // { CheckClass: CheckBraveIndexing, maxScore: 1 },
];

/**
 * Get instantiated visibility checks with configured weights
 */
export function getAllVisibilityChecks(): BaseVisibilityCheck[] {
  return VISIBILITY_CHECKS.map(config => {
    const instance = new config.CheckClass();
    instance.setMaxScore(config.maxScore);
    return instance;
  });
}

/**
 * Fetch page content for both desktop and mobile browsers
 * Returns PageCaptured structure with all data
 * @param url - URL to fetch
 * @returns PageCaptured with desktop and mobile content and timing data
 */
async function fetchPageContent(url: string): Promise<PageCaptured> {
  const pageCaptured: PageCaptured = {};

  // Fetch desktop version
  logger.info('  Fetching website as a desktop browser...');
  try {
    const startTime = Date.now();
    const response = await callHttpWithRetry(url, {
      userAgent: DESKTOP_BROWSER_USER_AGENT,
      headers: DEFAULT_BROWSER_HEADERS,
      contextInfo: `Fetching desktop HTML: ${url}`
    });

    if (response.ok) {
      const html = await response.text();
      const endTime = Date.now();

      pageCaptured.browserHtmlDesktop = html;
      pageCaptured.browserHeadersDesktop = response.headers;
      pageCaptured.desktopResponseTimeMs = endTime - startTime;
      pageCaptured.desktopStatusCode = response.status;
      pageCaptured.desktopFetchedAt = new Date();

      logger.info(`   Desktop: ${html.length} bytes in ${endTime - startTime}ms`);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error: any) {
    logger.warn(`   Desktop fetch failed: ${error.message}`);
  }

  // Add delay before mobile fetch to avoid rate limiting
  if (pageCaptured.browserHtmlDesktop) {
    await delay(AI_VISIBILITY_CHECK_DELAY_MS);
  }

  // Fetch mobile version
  logger.info('  Fetching website as a mobile browser...');
  try {
    const startTime = Date.now();
    const response = await callHttpWithRetry(url, {
      userAgent: MOBILE_BROWSER_USER_AGENT,
      headers: DEFAULT_BROWSER_HEADERS,
      contextInfo: `Fetching mobile HTML: ${url}`
    });

    if (response.ok) {
      const html = await response.text();
      const endTime = Date.now();

      pageCaptured.browserHtmlMobile = html;
      pageCaptured.browserHeadersMobile = response.headers;
      pageCaptured.mobileResponseTimeMs = endTime - startTime;
      pageCaptured.mobileStatusCode = response.status;
      pageCaptured.mobileFetchedAt = new Date();

      logger.info(`   Mobile: ${html.length} bytes in ${endTime - startTime}ms`);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error: any) {
    logger.warn(`   Mobile fetch failed: ${error.message}`);
  }

  if (!pageCaptured.browserHtmlDesktop && !pageCaptured.browserHtmlMobile) {
    logger.warn('Could not fetch page with either desktop or mobile user agents. Some checks will be limited.');
  }

  return pageCaptured;
}

/**
 * Prompt for URL input
 */
function promptForUrl(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(colorize('\nCheck AI visibility for URL: ', 'yellow'), (answer) => {      
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Validate and normalize URL
 */
function validateUrl(urlString: string): string {
  // Add https:// if no protocol specified
  if (!urlString.match(/^https?:\/\//i)) {
    urlString = 'https://' + urlString;
  }

  try {
    const url = new URL(urlString);
    return url.toString();
  } catch (error) {
    throw new Error(`Invalid URL: ${urlString}`);
  }
}

function calculateLetterGrade(percentage: number): string {
  if (percentage >= 97) return 'A+';
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';

  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';

  if (percentage >= 77) return 'C+';
  if (percentage >= 73) return 'C';
  if (percentage >= 70) return 'C-';

  if (percentage >= 67) return 'D+';
  if (percentage >= 63) return 'D';
  if (percentage >= 60) return 'D-';

  return 'F';
}

async function main(): Promise<void> {
  // Initialize logger
  await logger.initialize(import.meta.url);

  // Get URL from CLI arg or prompt
  let urlString = process.argv[3] || '';

  if (!urlString) {
    // Show permission notice before prompting
    logger.log('');
    logger.log(colorize('⚠️  By continuing, you confirm that you have all required permissions', 'yellow'));
    logger.log(colorize('   to test the URL for AI visibility. Press CTRL+C to cancel.', 'yellow'));
    logger.log('');

    urlString = await promptForUrl();
  }

  if (!urlString) {
    logger.error('No URL provided');
    process.exit(1);
  }

  // Validate and normalize URL
  let url: string;
  try {
    url = validateUrl(urlString);
  } catch (error: any) {
    logger.error(error.message);
    process.exit(1);
  }

  // Format the output with better visual hierarchy
  const products = getUniqueAIProducts();
  const groupSize = 4;
  const productGroups: string[] = [];

  // Group products into lines of ~4 for better readability
  for (let i = 0; i < products.length; i += groupSize) {
    productGroups.push(products.slice(i, i + groupSize).join(', '));
  }

  // Display formatted message
  logger.info(colorize('\n🔍 Checking AI Visibility\n', 'bright'));
  logger.info(`   ${colorize('Website:', 'dim')}  ${colorize(url, 'cyan')}\n`);

  // Show what will be performed
  logger.info(colorize('   This action will:', 'dim'));
  logger.info(colorize(`   • Fetch the page for desktop and mobile browsers`, 'dim'));
  logger.info(colorize(`   • Perform ${VISIBILITY_CHECKS.length} AI visibility checks`, 'dim'));
  logger.info(colorize(`   • Test visibility and indexing by ${products.length} AI products including:`, 'dim'));
  productGroups.forEach(group => {
    logger.info(colorize(`      → ${group}`, 'dim'));
  });

  // Wait for user confirmation in interactive mode (or Ctrl+C to cancel)
  await waitForEnterInInteractiveMode(WaitForEnterMessageType.PRESS_ENTER_TO_CONTINUE);
  logger.info(''); // Empty line for spacing

  // Fetch page content for both desktop and mobile
  const pageCaptured = await fetchPageContent(url);
  logger.info(''); // Empty line for spacing

  // Pre-fetch robots.txt and sitemap.xml for caching (improves performance)
  logger.info('  Pre-fetching robots.txt and sitemap.xml...');
  const urlObj = new URL(url);

  try {
    const robotsResponse = await callHttpWithRetry(`${urlObj.protocol}//${urlObj.host}/robots.txt`, {
      contextInfo: 'Pre-fetching robots.txt',
      maxRetries: 1
    });
    pageCaptured.robotsTxtStatus = robotsResponse.status;
    if (robotsResponse.ok) {
      pageCaptured.robotsTxtContent = await robotsResponse.text();
    }
  } catch (err) {
    // Pre-fetch failed, checks will retry if needed
  }

  try {
    const sitemapResponse = await callHttpWithRetry(`${urlObj.protocol}//${urlObj.host}/sitemap.xml`, {
      contextInfo: 'Pre-fetching sitemap.xml',
      maxRetries: 1
    });
    pageCaptured.sitemapXmlStatus = sitemapResponse.status;
    if (sitemapResponse.ok) {
      pageCaptured.sitemapXmlContent = await sitemapResponse.text();
    }
  } catch (err) {
    // Pre-fetch failed, checks will retry if needed
  }

  logger.info(''); // Empty line for spacing

  // Preflight check: ensure website is reachable
  if (!pageCaptured.browserHtmlDesktop && !pageCaptured.browserHtmlMobile) {
    logger.log('');
    logger.error(colorize('⚠️  URL Is Not Accessible Or Not Found', 'red'));
    logger.log('');
    logger.log(colorize('   The domain does NOT exist or is not reachable:', 'dim'));
    logger.log(colorize(`   ${url}`, 'red'));
    logger.log('');
    logger.log(colorize('   Cannot continue with AI visibility checks.', 'dim'));
    logger.log(colorize('   Please verify the URL is correct and try again.', 'dim'));
    logger.log('');
    await waitForEnterInInteractiveMode();
    process.exit(1);
  }

  // Load all visibility checks
  const checks = getAllVisibilityChecks();

  // Execute each check with delays to prevent rate limiting
  let totalScore = 0;
  let totalMaxScore = 0;
  const allResults: Array<{check: BaseVisibilityCheck, result: VisibilityCheckResult}> = [];

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];

    // Add delay between checks (except before first check)
    if (i > 0) {
      // Add small jitter to prevent pattern detection
      const jitter = Math.floor(Math.random() * 100) - 50; // ±50ms
      await delay(AI_VISIBILITY_CHECK_DELAY_MS + jitter);
    }

    // Execute check, passing pageCaptured with all desktop and mobile data
    const result = await check.execute(url, pageCaptured);

    // Display result
    const icon = result.error ? '❌' : result.passed ? '✓' : '⚠';
    const color = result.error ? 'red' : result.passed ? 'green' : 'yellow';
    const roundedScore = Math.round(result.score * 10) / 10; // Round to 1 decimal
    const scoreText = result.error ? 'ERR' : `${roundedScore}/${result.maxScore}`;
    const padding = ' '.repeat(Math.max(0, 25 - check.name.length));

    logger.log(
      `${colorize(icon, color)} ${check.name}${padding}${colorize(scoreText.padStart(7), color)}  ${result.details}`
    );

    // Store result for final report
    allResults.push({ check, result });

    // Add blank line after last bot check to separate from other checks
    const isCurrentBotCheck = check instanceof ServerBaseBotAccessibilityCheck;
    const nextCheck = checks[i + 1];
    const isNextBotCheck = nextCheck instanceof ServerBaseBotAccessibilityCheck;

    if (isCurrentBotCheck && !isNextBotCheck) {
      logger.log('');
    }

    // Accumulate totals (exclude errors from calculation)
    if (!result.error) {
      totalScore += result.score;
      totalMaxScore += result.maxScore;
    }
  }

  // Calculate percentage
  const roundedTotalScore = Math.round(totalScore * 10) / 10; // Round to 2 decimal places
  const percentage = totalMaxScore > 0
    ? Math.round((totalScore / totalMaxScore) * 100)
    : 0;

  // Ensure output state is normal before displaying summary
  logger.log('');

  // Display clean report summary
  const letterGrade = calculateLetterGrade(percentage);
  const scoreColor = percentage >= 80 ? 'green' : percentage >= 50 ? 'yellow' : 'red';

  logger.log('='.repeat(80));
  const formattedDate = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  logger.log(`AI VISIBILITY REPORT for ${colorize(url, 'cyan')} on ${colorize(formattedDate, 'bright')}`);
  logger.log('='.repeat(80));
  logger.log(
    colorize(`SCORE: ${percentage}% (${roundedTotalScore}/${totalMaxScore} points)\nGRADE: ${colorize(letterGrade, scoreColor)}`, 'bright')
  );
  logger.log('='.repeat(80));
  logger.log('');

  // Display detailed results table
  logger.log('DETAILS:');
  for (const {check, result} of allResults) {
    const icon = result.error ? '[FAIL]' : result.passed ? '[PASS]' : '[WARN]';
    const color = result.error ? 'red' : result.passed ? 'green' : 'yellow';
    const roundedScore = Math.round(result.score * 10) / 10;
    const scoreText = result.error ? 'ERR' : `${roundedScore}/${result.maxScore}`;
    const padding = '.'.repeat(Math.max(0, 45 - check.name.length));

    logger.log(
      `  ${colorize(icon, color)} ${check.name}${padding} ${scoreText.padStart(8)}`
    );
  }

  // Display issues and recommendations section
  const issuesAndWarnings = allResults.filter(({result}) => !result.passed || result.error);

  if (issuesAndWarnings.length > 0) {
    logger.log('');
    logger.log('-'.repeat(80));
    logger.log('ISSUES:');
    logger.log('-'.repeat(80));

    // Group by severity: errors first, then warnings
    const errors = issuesAndWarnings.filter(({result}) => result.error);
    const warnings = issuesAndWarnings.filter(({result}) => !result.error && !result.passed);

    // Display errors
    if (errors.length > 0) {
      logger.log('');
      for (const {check, result} of errors) {
        logger.log(colorize(`  ❌ ${check.name}`, 'red'));
        logger.log(colorize(`     Status: Check failed`, 'red'));
        logger.log(`     Details:  ${result.details}`);
        logger.log('');
      }
    }

    // Display warnings
    if (warnings.length > 0) {
      for (const {check, result} of warnings) {
        const roundedScore = Math.round(result.score * 10) / 10;
        const lostPoints = Math.round((result.maxScore - roundedScore) * 10) / 10;
        logger.log(colorize(`  ⚠️  ${check.name}`, 'yellow'));
        logger.log(colorize(`     Impact: ${lostPoints} point${lostPoints !== 1 ? 's' : ''} lost`, 'yellow'));
        logger.log(`     Details:  ${result.details}`);
        logger.log('');
      }
    }
  } else {
    logger.log('');
    logger.log(colorize('✓ No issues found - excellent AI visibility!', 'green'));
    logger.log('');
  }

  logger.log('='.repeat(80));
  logger.log(colorize('To schedule this report, please visit https://aichatwatch.com/schedule', 'dim'));
  logger.log('='.repeat(80));

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  process.exit(1);
});
