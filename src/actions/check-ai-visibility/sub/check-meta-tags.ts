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

import { BaseVisibilityCheck, VisibilityCheckResult } from './base-visibility-check.js';

export class CheckMetaTags extends BaseVisibilityCheck {
  readonly name = 'Meta Tags Check';

  protected async performCheck(url: string, browserHtml?: string): Promise<VisibilityCheckResult> {
    // Require HTML content - this check doesn't fetch
    if (!browserHtml) {
      throw new Error('HTML content is required for meta tags check');
    }

    // Check for blocking meta tags
    const blockingPatterns = [
      {
        regex: /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']/i,
        description: 'robots noindex'
      },
      {
        regex: /<meta\s+name=["']robots["']\s+content=["'][^"']*noai[^"']*["']/i,
        description: 'robots noai'
      },
      {
        regex: /<meta\s+name=["']googlebot["']\s+content=["'][^"']*noindex[^"']*["']/i,
        description: 'googlebot noindex'
      }
    ];

    const foundTags: string[] = [];
    for (const pattern of blockingPatterns) {
      if (pattern.regex.test(browserHtml)) {
        foundTags.push(pattern.description);
      }
    }

    const score = foundTags.length === 0 ? 10 : 0;

    return {
      score,
      maxScore: this.maxScore,
      passed: score === 10,
      details: foundTags.length === 0
        ? 'No blocking meta tags'
        : `Found blocking tags: ${foundTags.join(', ')}`,
      metadata: { blockedBy: foundTags }
    };
  }
}
