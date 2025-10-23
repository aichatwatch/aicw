/**
 * Robots.txt Check
 *
 * Checks if robots.txt blocks any AI bots defined in ai-user-agents.ts
 * Parses robots.txt rules and checks each bot's identifier against Disallow rules.
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';
import { callHttpWithRetry } from '../../../utils/http-caller.js';
import { AI_USER_AGENTS } from '../../../config/ai-user-agents.js';
import { calculateProductVisibility, getUniqueAIProducts } from '../utils/ai-product-utils.js';

const MODULE_NAME = 'Check /robots.txt';

/**
 * Simple robots.txt parser
 * Checks if a specific bot identifier is disallowed
 */
function parserobotsForBot(robotsTxt: string, botIdentifier: string): boolean {
  const lines = robotsTxt.split('\n').map(line => line.trim());

  let currentUserAgent = '*';
  let isBlocked = false;

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line === '') continue;

    // User-agent directive
    if (line.toLowerCase().startsWith('user-agent:')) {
      const agent = line.substring(11).trim();
      currentUserAgent = agent;
    }

    // Disallow directive
    if (line.toLowerCase().startsWith('disallow:')) {
      const path = line.substring(9).trim();

      // Check if this rule applies to our bot
      if (currentUserAgent === '*' ||
          currentUserAgent.toLowerCase() === botIdentifier.toLowerCase()) {
        // If disallow is for root path, bot is blocked
        if (path === '/' || path === '') {
          isBlocked = true;
        }
      }
    }

    // Allow directive (overrides disallow)
    if (line.toLowerCase().startsWith('allow:')) {
      const path = line.substring(6).trim();

      if (currentUserAgent === '*' ||
          currentUserAgent.toLowerCase() === botIdentifier.toLowerCase()) {
        // If allow is for root, bot is not blocked
        if (path === '/' || path === '') {
          isBlocked = false;
        }
      }
    }
  }

  return isBlocked;
}

export class CheckRobotsTxt extends BaseVisibilityCheck {
  readonly name = MODULE_NAME;

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    // Note: pageCaptured is not used by this check (we fetch robots.txt separately)
    // Construct robots.txt URL
    const urlObj = new URL(url);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

    try {
      const response = await callHttpWithRetry(robotsUrl, {
        contextInfo: `Robots.txt check: ${robotsUrl}`,
        maxRetries: 2  // Don't retry as much for robots.txt
      });

      // If robots.txt doesn't exist, all bots are allowed
      if (response.status === 404) {
        const totalProducts = getUniqueAIProducts().length;
        return {
          score: this.maxScore,
          maxScore: this.maxScore,
          passed: true,
          details: `No /robots.txt found - visible to all ${totalProducts} AI products`
        };
      }

      if (!response.ok) {
        return {
          score: -1,
          maxScore: this.maxScore,
          passed: false,
          details: `HTTP ${response.status}`,
          error: true
        };
      }

      const robotsTxt = await response.text();

      // Check each AI bot
      const blockedBots: string[] = [];
      for (const bot of AI_USER_AGENTS) {
        const identifier = bot.identifier;
        if (parserobotsForBot(robotsTxt, identifier)) {
          blockedBots.push(bot.name);
        }
      }

      // Calculate AI product visibility
      const blockedBotNames = new Set(blockedBots);
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

      // Build details message
      let details: string;
      if (hiddenProducts.length === 0) {
        details = `Present, allowing indexing to all ${totalProducts} AI products`;
      } else if (visibleProducts.length === 0) {
        details = `Hidden from indexing to all ${totalProducts} AI products`;
      } else {
        details = `${visibleCount}/${totalProducts} visible, allowing indexing to ${visibleProducts.join(', ')}\n` +
          `   ❌ Hidden: ${hiddenProducts.join(', ')}`;
      }
      details = details + '\n';

      return {
        score,
        maxScore: this.maxScore,
        passed: score >= 7,
        details,
        metadata: {
          blockedBots,
          visibleProducts,
          hiddenProducts,
          totalProducts,
          visibleCount,
          totalBots: AI_USER_AGENTS.length
        }
      };

    } catch (error: any) {
      // If can't fetch robots.txt, assume all bots allowed
      const totalProducts = getUniqueAIProducts().length;
      return {
        score: this.maxScore,
        maxScore: this.maxScore,
        passed: true,
        details: `No robots.txt accessible - visible to all ${totalProducts} AI products`
      };
    }
  }
}
