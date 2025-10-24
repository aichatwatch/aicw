/**
 * Base class for AI bot accessibility checks
 *
 * Subclasses only need to specify:
 * - name: Display name for the check
 * - botTypeFilter: Tag to filter which bots to test
 *
 * All testing logic is handled here.
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';
import { callHttpWithRetry } from '../../../utils/http-caller.js';
import { AI_USER_AGENTS } from '../../../config/ai-user-agents.js';
import { interruptibleDelay as delay } from '../../../utils/delay.js';
import { AI_BOT_TEST_DELAY_MS } from '../../../config/constants.js';
import { logger } from '../../../utils/compact-logger.js';
import { calculateProductVisibility, getUniqueAIProducts } from '../utils/ai-product-utils.js';

// Configuration constants
const CONTENT_SIZE_TOLERANCE = 0.03; // 3% size difference allowed when comparing to baseline
const MIN_VALID_HTML_SIZE = 500; // Minimum bytes to be considered valid content (not error page)

/**
 * Check if two content sizes are similar within tolerance
 */
function isContentSimilar(size1: number, size2: number, tolerance: number = CONTENT_SIZE_TOLERANCE): boolean {
  const diff = Math.abs(size1 - size2);
  const avgSize = (size1 + size2) / 2;

  // If avg size is 0, both must be 0 to be similar
  if (avgSize === 0) {
    return size1 === 0 && size2 === 0;
  }

  return (diff / avgSize) <= tolerance;
}

/**
 * Abstract base class for bot accessibility checks
 * Subclasses define which bot type to test via botTypeFilter
 */
export abstract class BaseBotAccessibilityCheck extends BaseVisibilityCheck {
  /**
   * Subclasses must specify which bot classification tag to filter by
   * E.g., CRAWLER_BOT_CLASSIFICATION_TAGS.AI_FOUNDATION_MODEL_TRAINING
   */
  protected abstract readonly botTypeFilter: string;

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    // Filter bots by the specified type
    const botsToTest = AI_USER_AGENTS.filter(bot =>
      bot.tags?.includes(this.botTypeFilter)
    );

    if (botsToTest.length === 0) {
      throw new Error(`No bots found for bot type filter: ${this.botTypeFilter}`);
    }

    // Step 1: Determine testing mode
    const browserHtml = pageCaptured?.browserHtmlDesktop;
    const baselineSize = browserHtml?.length;
    const hasBaseline = !!baselineSize;

    if (!hasBaseline) {
      logger.debug('Running bot accessibility test without browser baseline (bot-only testing)');
    }

    // Step 2: Test each AI bot with delays to prevent rate limiting
    const results: Array<{ bot: string; accessible: boolean; status: number; size: number }> = [];

    // Wrap progress in try-finally to ensure completion
    try {
      logger.startProgress(
        `Server: checking accessibility for "${this.name}": `,
        botsToTest.length,
        'bots'
      );

      for (let i = 0; i < botsToTest.length; i++) {
        const bot = botsToTest[i];

        // Add delay between bot tests (except before first bot)
        if (i > 0) {
          // Add small jitter to prevent pattern detection
          const jitter = Math.floor(Math.random() * 100) - 50; // ±50ms
          await delay(AI_BOT_TEST_DELAY_MS + jitter);
        }

        try {
          const botResponse = await callHttpWithRetry(url, {
            userAgent: bot.user_agent,
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml'
            },
            contextInfo: `Checking accessibility for the bot: ${bot.name}: ${url}`,
            maxRetries: 2  // Don't retry as much for bot checks
          });

          const botContent = await botResponse.text();
          const botSize = botContent.length;

          // Check accessibility based on mode
          let isAccessible: boolean;
          if (hasBaseline) {
            // With baseline: compare size to browser baseline
            isAccessible =
              botResponse.status === 200 &&
              botSize >= MIN_VALID_HTML_SIZE &&
              isContentSimilar(baselineSize!, botSize);
          } else {
            // Bot-only mode: just check if bot gets valid content
            isAccessible =
              botResponse.status === 200 &&
              botSize >= MIN_VALID_HTML_SIZE;
          }

          results.push({
            bot: bot.name,
            accessible: isAccessible,
            status: botResponse.status,
            size: botSize
          });

          // Update progress with result
          const statusIcon = isAccessible ? '✓' : '✗';
          logger.updateProgress(i + 1, `${bot.name} ${statusIcon}`);
        } catch (error: any) {
          // Bot request failed
          results.push({
            bot: bot.name,
            accessible: false,
            status: 0,
            size: 0
          });
          logger.updateProgress(i + 1, `${bot.name} ✗`);
        }
      }
    } finally {
      // ALWAYS complete progress, even if error occurs
      logger.completeProgress('');
    }

    // Get blocked/inaccessible bots
    const blockedBots = results.filter(r => !r.accessible).map(r => r.bot);
    const blockedBotNames = new Set(blockedBots);

    // Calculate AI product visibility
    const productVisibility = calculateProductVisibility(blockedBotNames);

    // Get visible and hidden products
    const visibleProducts: string[] = [];
    const hiddenProducts: string[] = [];

    for (const [product, isVisible] of productVisibility) {
      if (isVisible) {
        visibleProducts.push(product);
      } else {
        hiddenProducts.push(product);
      }
    }

    const totalProducts = productVisibility.size;
    const visibleCount = visibleProducts.length;

    // Score based on products (scaled to maxScore)
    const score = Math.round((visibleCount / totalProducts) * this.maxScore);

    // Passing threshold: 70% of maxScore
    const passingThreshold = Math.round(this.maxScore * 0.7);

    // Build details message
    const modeNote = !hasBaseline ? ' (bot-only testing)' : '';
    let details: string;
    if (hiddenProducts.length === 0) {
      details = `Visible to all ${totalProducts} AI products${modeNote}`;
    } else if (visibleProducts.length === 0) {
      details = `Hidden from all ${totalProducts} AI products${modeNote}`;
    } else {
      details = `${visibleCount}/${totalProducts} visible${modeNote}\n` +
        `   ✓ Visible: ${visibleProducts.join(', ')}\n` +
        `   ❌ Hidden: ${hiddenProducts.join(', ')}`;
    }

    return {
      score,
      maxScore: this.maxScore,
      passed: score >= passingThreshold,
      details,
      metadata: {
        baselineSize,
        results,
        blockedBots,
        visibleProducts,
        hiddenProducts,
        totalProducts,
        visibleCount,
        totalBots: botsToTest.length,
        botTypeFilter: this.botTypeFilter
      }
    };
  }
}
