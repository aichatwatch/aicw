/**
 * Robots.txt Check
 *
 * Checks if robots.txt blocks any AI bots defined in ai-user-agents.ts
 * Parses robots.txt rules and checks each bot's identifier against Disallow rules.
 */

import { BaseVisibilityCheck, VisibilityCheckResult } from './base-visibility-check.js';
import { callHttpWithRetry } from '../../../utils/http-caller.js';
import { AI_USER_AGENTS, AIBotDefinition } from '../../../config/ai-user-agents.js';

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
  readonly name = 'Robots.txt Check';

  protected async performCheck(url: string, browserHtml?: string): Promise<VisibilityCheckResult> {
    // Note: browserHtml is not used by this check (we fetch robots.txt separately)
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
        return {
          score: 10,
          maxScore: this.maxScore,
          passed: true,
          details: 'No robots.txt (all bots allowed)'
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
        if (parserobotsForBot(robotsTxt, bot.identifier)) {
          blockedBots.push(bot.name);
        }
      }

      const allowedCount = AI_USER_AGENTS.length - blockedBots.length;
      const score = Math.round(10 * (allowedCount / AI_USER_AGENTS.length));

      return {
        score,
        maxScore: this.maxScore,
        passed: score >= 7,
        details: blockedBots.length === 0
          ? 'All AI bots allowed'
          : `${blockedBots.length} bot(s) blocked: ${blockedBots.join(', ')}`,
        metadata: {
          blockedBots,
          allowedCount,
          totalBots: AI_USER_AGENTS.length
        }
      };

    } catch (error: any) {
      // If can't fetch robots.txt, assume all bots allowed
      return {
        score: 10,
        maxScore: this.maxScore,
        passed: true,
        details: 'No robots.txt accessible (all bots allowed)'
      };
    }
  }
}
