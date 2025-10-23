/**
 * Meta Tags Check
 *
 * Checks for blocking meta tags that prevent AI indexing:
 * - <meta name="robots" content="noindex">
 * - <meta name="robots" content="noai">
 * - <meta name="googlebot" content="noindex">
 *
 * Note: This check requires pre-fetched HTML content (browserHtml parameter).
 * It does NOT fetch HTML itself to avoid duplicate requests.
 */

import { AI_USER_AGENTS } from '../../../config/ai-user-agents.js';
import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';

const MODULE_NAME = 'Content Blocking Meta Tags Check';

export class CheckContentMetaTags extends BaseVisibilityCheck {
  readonly name = MODULE_NAME;

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    // Require HTML content - this check doesn't fetch
    const browserHtml = pageCaptured?.browserHtmlDesktop;
    if (!browserHtml) {
      throw new Error('HTML content is required for meta tags check');
    }

    // Fixed regex pattern with proper alternation and case-insensitive flag
    const BLOCKING_META_TAG_REGEX_TEMPLATE = `<meta\\s+name=["']{{ID}}["']\\s+content=["'][^"']*\\b(noindex|noai|noimageai|nosnippet)\\b[^"']*["']`;
    const blockingPatterns = [];

    // adding general robots.txt
    blockingPatterns.push({
        regex: new RegExp(BLOCKING_META_TAG_REGEX_TEMPLATE.replace('{{ID}}', 'robots'), 'i'), 
        description: 'robots noindex',
        score: this.maxScore // blocks all bots
    });

    // adding specific AI bots
    const scorePerBot = this.maxScore / AI_USER_AGENTS.length;
    for(const bot of AI_USER_AGENTS) {
        blockingPatterns.push({
            regex: new RegExp(BLOCKING_META_TAG_REGEX_TEMPLATE.replace('{{ID}}', bot.identifier), 'i'),
            description: `${bot.identifier} noindex`,
            score: scorePerBot
        });
    }

    // collecting blocking meta tags found
    const foundTags: string[] = [];
    let score = this.maxScore;
    for (const pattern of blockingPatterns) {
      if (pattern.regex.test(browserHtml)) {
        foundTags.push(pattern.description);
        score = score - pattern.score;
        if(score <=0)
          break;
      }
    }

    // normalize
    if(score<0) { score = 0;}

    return {
      score,
      maxScore: this.maxScore,
      passed: score === this.maxScore,
      details: foundTags.length === 0
        ? 'No blocking meta tags'
        : `Found blocking tags: ${foundTags.join(', ')}`,
      metadata: { blockedBy: foundTags }
    };
  }
}
