/**
 * Check AI Visibility Action
 *
 * Verifies if a website is accessible and properly indexed by AI crawlers.
 * Runs multiple checks and displays a weighted score report.
 */

import { createInterface } from 'readline';
import { logger } from '../../utils/compact-logger.js';
import { colorize, waitForEnterInInteractiveMode } from '../../utils/misc-utils.js';
import { interruptibleDelay as delay } from '../../utils/delay.js';
import { AI_VISIBILITY_CHECK_DELAY_MS } from '../../config/constants.js';
import { callHttpWithRetry } from '../../utils/http-caller.js';
import { DEFAULT_BROWSER_HEADERS, DESKTOP_BROWSER_USER_AGENT, MOBILE_BROWSER_USER_AGENT } from '../../config/ai-user-agents.js';
// sub actions
import { BaseVisibilityCheck, PageCaptured } from './sub/check-base.js';
import { CheckJsonLD } from './sub/check-json-ld.js';
import { CheckMetaTags } from './sub/check-meta-tags.js';
import { CheckHttpHeaders } from './sub/check-http-headers.js';
import { CheckAIBotAccessibility } from './sub/check-ai-bot-accessibility.js';
import { CheckRobotsTxt } from './sub/check-robots-txt.js';
import { CheckSitemap } from './sub/check-sitemap.js';
import { CheckLlmsTxt } from './sub/check-llms-txt.js';
import { CheckCommonCrawl } from './sub/check-common-crawl.js';
import { CheckGoogleIndexing } from './sub/check-google-indexing.js';
import { CheckBingIndexing } from './sub/check-bing-indexing.js';
import { CheckBraveIndexing } from './sub/check-brave-indexing.js';
import { CheckJavaScriptDependency } from './sub/check-javascript-dependency.js';
import { CheckMobileCompatibility } from './sub/check-mobile-compatibility.js';
import { CheckResponseSpeed } from './sub/check-response-speed.js';
import { getUniqueAIProducts } from './utils/ai-product-utils.js';

export const VISIBILITY_CHECKS: (new () => BaseVisibilityCheck)[] = [
  CheckRobotsTxt,
  CheckHttpHeaders,
  CheckSitemap,
  CheckLlmsTxt,
  CheckAIBotAccessibility,
  CheckJavaScriptDependency,
  CheckMobileCompatibility,
  CheckResponseSpeed,
  CheckMetaTags,
  CheckJsonLD,
  CheckCommonCrawl,
  //CheckGoogleIndexing,
  //CheckBingIndexing,
  //CheckBraveIndexing
];

/**
 * Get instantiated visibility checks in execution order
 */
export function getAllVisibilityChecks(): BaseVisibilityCheck[] {
  return VISIBILITY_CHECKS.map(CheckClass => new CheckClass());
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
  logger.info('📱 Fetching website with desktop browser...');
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
  logger.info('📱 Fetching website with mobile browser...');
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
    rl.question(colorize('Enter website URL to check: ', 'yellow'), (answer) => {
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

async function main(): Promise<void> {
  // Initialize logger
  await logger.initialize(import.meta.url);

  // Get URL from CLI arg or prompt
  let urlString = process.argv[3] || '';

  if (!urlString) {
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
  logger.info(colorize(`   Testing visibility for ${products.length} AI products:`, 'dim'));
  productGroups.forEach(group => {
    logger.info(colorize(`   → ${group}`, 'dim'));
  });
  logger.info(''); // Empty line for spacing

  // Fetch page content for both desktop and mobile
  const pageCaptured = await fetchPageContent(url);
  logger.info(''); // Empty line for spacing

  // Preflight check: ensure website is reachable
  if (!pageCaptured.browserHtmlDesktop && !pageCaptured.browserHtmlMobile) {
    logger.log('');
    logger.error(colorize('⚠️  Website Not Accessible', 'red'));
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

    // Accumulate totals (exclude errors from calculation)
    if (!result.error) {
      totalScore += result.score;
      totalMaxScore += result.maxScore;
    }
  }

  // Calculate percentage
  const roundedTotalScore = Math.round(totalScore * 10) / 10; // Round to 1 decimal
  const percentage = totalMaxScore > 0
    ? Math.round((totalScore / totalMaxScore) * 100)
    : 0;

  // Display summary
  logger.log('\n' + colorize('━'.repeat(70), 'dim'));

  const scoreColor = percentage >= 80 ? 'green' : percentage >= 50 ? 'yellow' : 'red';
  logger.log(
    colorize(`📊 Overall Score:  ${percentage}% (${roundedTotalScore} out of ${totalMaxScore})`, scoreColor)
  );

  logger.log('');

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  process.exit(1);
});
