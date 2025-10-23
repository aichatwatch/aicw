/**
 * AI Bot Accessibility Check
 *
 * Tests if AI bots receive similar content compared to regular browsers.
 * Fetches page with browser UA (baseline) and then with each AI bot UA.
 * Compares HTTP status and content size with 3% tolerance.
 */

import { BaseVisibilityCheck, VisibilityCheckResult } from './check-base.js';
import { callHttpWithRetry } from '../../../utils/http-caller.js';
import { AI_USER_AGENTS, BROWSER_USER_AGENT } from '../../../config/ai-user-agents.js';
import { interruptibleDelay as delay } from '../../../utils/delay.js';
import { AI_BOT_TEST_DELAY_MS } from '../../../config/constants.js';

/**
 * Check if two content sizes are similar within tolerance
 * @param size1 - First size
 * @param size2 - Second size
 * @param tolerance - Allowed difference as decimal (0.03 = 3%)
 */
function isContentSimilar(size1: number, size2: number, tolerance: number = 0.03): boolean {
  const diff = Math.abs(size1 - size2);
  const avgSize = (size1 + size2) / 2;

  // If avg size is 0, both must be 0 to be similar
  if (avgSize === 0) {
    return size1 === 0 && size2 === 0;
  }

  return (diff / avgSize) <= tolerance;
}

export class CheckAIBotAccessibility extends BaseVisibilityCheck {
  readonly name = 'AI Bot Accessibility';

  protected async performCheck(url: string, browserHtml?: string): Promise<VisibilityCheckResult> {
    // Step 1: Get baseline size (use cached HTML if provided, else fetch)
    let baselineSize: number;

    if (browserHtml) {
      // Use pre-fetched HTML for baseline size (optimization)
      baselineSize = browserHtml.length;
    } else {
      // Fallback: fetch with browser UA
      const browserResponse = await callHttpWithRetry(url, {
        userAgent: BROWSER_USER_AGENT,
        contextInfo: `Bot accessibility baseline: ${url}`
      });

      if (!browserResponse.ok) {
        return {
          score: -1,
          maxScore: this.maxScore,
          passed: false,
          details: `Baseline failed: HTTP ${browserResponse.status}`,
          error: true
        };
      }

      const browserContent = await browserResponse.text();
      baselineSize = browserContent.length;
    }

    // Step 2: Test each AI bot with delays to prevent rate limiting
    const results: Array<{ bot: string; accessible: boolean; status: number; size: number }> = [];

    for (let i = 0; i < AI_USER_AGENTS.length; i++) {
      const bot = AI_USER_AGENTS[i];

      // Add delay between bot tests (except before first bot)
      if (i > 0) {
        // Add small jitter to prevent pattern detection
        const jitter = Math.floor(Math.random() * 100) - 50; // ±50ms
        await delay(AI_BOT_TEST_DELAY_MS + jitter);
      }

      try {
        const botResponse = await callHttpWithRetry(url, {
          userAgent: bot.user_agent,
          contextInfo: `Bot accessibility ${bot.name}: ${url}`,
          maxRetries: 2  // Don't retry as much for bot checks
        });

        const botContent = await botResponse.text();
        const botSize = botContent.length;

        const isAccessible =
          botResponse.status === 200 &&
          isContentSimilar(baselineSize, botSize, 0.03);

        results.push({
          bot: bot.name,
          accessible: isAccessible,
          status: botResponse.status,
          size: botSize
        });
      } catch (error: any) {
        // Bot request failed
        results.push({
          bot: bot.name,
          accessible: false,
          status: 0,
          size: 0
        });
      }
    }

    // Calculate score
    const accessibleCount = results.filter(r => r.accessible).length;
    const score = Math.round(10 * (accessibleCount / AI_USER_AGENTS.length));
    const blockedBots = results.filter(r => !r.accessible).map(r => r.bot);

    return {
      score,
      maxScore: this.maxScore,
      passed: score >= 7,
      details: blockedBots.length === 0
        ? 'All bots get similar content'
        : `${blockedBots.length} bot(s) blocked/different: ${blockedBots.join(', ')}`,
      metadata: {
        baselineSize,
        results,
        accessibleCount,
        totalBots: AI_USER_AGENTS.length
      }
    };
  }
}
