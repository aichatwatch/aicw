/**
 * Check AI Visibility Action
 *
 * Verifies if a website is accessible and properly indexed by AI crawlers.
 * Runs multiple checks and displays a weighted score report.
 */

import { createInterface } from 'readline';
import { getAllVisibilityChecks } from './sub/index.js';
import { logger } from '../../utils/compact-logger.js';
import { colorize, waitForEnterInInteractiveMode } from '../../utils/misc-utils.js';
import { interruptibleDelay as delay } from '../../utils/delay.js';
import { AI_VISIBILITY_CHECK_DELAY_MS } from '../../config/constants.js';
import { callHttpWithRetry } from '../../utils/http-caller.js';
import { BROWSER_USER_AGENT } from '../../config/ai-user-agents.js';

/**
 * Fetch HTML content with browser user agent
 * This HTML is shared across multiple checks to avoid duplicate requests
 */
async function fetchBrowserHtml(url: string): Promise<string> {
  const response = await callHttpWithRetry(url, {
    userAgent: BROWSER_USER_AGENT,
    contextInfo: `Fetching HTML: ${url}`
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch HTML: HTTP ${response.status}`);
  }

  return await response.text();
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

  logger.info(`\n${colorize('🔍 Checking AI Visibility:', 'bright')} ${url}\n`);

  // Fetch HTML once with browser UA - will be shared across checks
  let browserHtml: string;
  try {
    browserHtml = await fetchBrowserHtml(url);
    logger.debug(`Fetched HTML: ${browserHtml.length} bytes`);
  } catch (error: any) {
    logger.error(`Failed to fetch page: ${error.message}`);
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

    // Execute check, passing shared browserHtml
    const result = await check.execute(url, browserHtml);

    // Display result
    const icon = result.error ? '❌' : result.passed ? '✓' : '⚠';
    const color = result.error ? 'red' : result.passed ? 'green' : 'yellow';
    const scoreText = result.error ? 'ERR' : `${result.score}/${result.maxScore}`;
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
  const percentage = totalMaxScore > 0
    ? Math.round((totalScore / totalMaxScore) * 100)
    : 0;

  // Display summary
  logger.log('\n' + colorize('━'.repeat(70), 'dim'));

  const scoreColor = percentage >= 80 ? 'green' : percentage >= 50 ? 'yellow' : 'red';
  logger.log(
    colorize(`📊 Overall Score: ${totalScore}/${totalMaxScore} (${percentage}%)`, scoreColor)
  );

  logger.log('');

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  process.exit(1);
});
