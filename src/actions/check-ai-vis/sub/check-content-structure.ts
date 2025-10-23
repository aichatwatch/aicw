/**
 * AI Content Structure Check
 *
 * Verifies content is structured for AI search systems (Copilot, ChatGPT, etc.)
 * Based on Microsoft's AI Search optimization guidelines.
 *
 * Reference: https://about.ads.microsoft.com/en/blog/post/october-2025/optimizing-your-content-for-inclusion-in-ai-search-answers
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';

/**
 * Simple content check configuration
 */
interface ContentCheck {
  description: string;              // Used for found/missing messages
  pattern: RegExp | RegExp[];       // Pattern(s) to match
  requiredCount: number;            // How many needed for full points (count-based)
  patternAllItems?: RegExp;         // Optional: for ratio-based checks (e.g., images)
}

/**
 * Content checks configuration
 * Score is auto-distributed evenly among all checks
 */
const CHECKS: ContentCheck[] = [
  {
    description: 'H1 tag',
    pattern: /<h1[^>]*>/gi,
    requiredCount: 1
  },
  {
    description: 'H2/H3 headings',
    pattern: [/<h2[^>]*>/gi, /<h3[^>]*>/gi],
    requiredCount: 5
  },
  {
    description: 'meta description',
    pattern: /<meta\s+name=["']description["']\s+content=["'][^"']+["']/i,
    requiredCount: 1
  },
  {
    description: 'lists',
    pattern: /<(ul|ol)[^>]*>/gi,
    requiredCount: 1
  },
  {
    description: 'tables',
    pattern: /<table[^>]*>/gi,
    requiredCount: 1
  },
  {
    description: 'image alt text',
    patternAllItems: /<img[^>]*>/gi,        // All images
    pattern: /alt=["'][^"']+["']/i,         // Check each for alt attribute
    requiredCount: 1  // Not used for ratio checks
  }
];

export class CheckContentStructure extends BaseVisibilityCheck {
  readonly name = 'Content Structure for AI';

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    const browserHtml = pageCaptured?.browserHtmlDesktop;
    if (!browserHtml) {
      throw new Error('HTML content is required for content structure check');
    }

    const pointsPerCheck = this.maxScore / CHECKS.length;
    let totalScore = 0;
    const found: string[] = [];
    const missing: string[] = [];

    for (const check of CHECKS) {
      if (check.patternAllItems) {
        // RATIO-based scoring (e.g., images with alt text)
        const allItems = browserHtml.match(check.patternAllItems) || [];

        if (allItems.length === 0) {
          // No items to check = full points (don't penalize)
          totalScore += pointsPerCheck;
        } else {
          // Count items matching the pattern
          const patterns = Array.isArray(check.pattern) ? check.pattern : [check.pattern];
          const matchingItems = allItems.filter(item =>
            patterns.some(p => p.test(item))
          );

          const ratio = matchingItems.length / allItems.length;
          const score = pointsPerCheck * ratio;
          totalScore += score;

          // Consider "found" if >= 80% pass
          if (ratio >= 0.8) {
            found.push(check.description);
          } else {
            missing.push(check.description);
          }
        }
      } else {
        // COUNT-based scoring (e.g., headings, meta tags)
        const patterns = Array.isArray(check.pattern) ? check.pattern : [check.pattern];
        let count = 0;
        for (const p of patterns) {
          count += (browserHtml.match(p) || []).length;
        }

        const score = Math.min(count / check.requiredCount, 1) * pointsPerCheck;
        totalScore += score;

        if (count >= check.requiredCount) {
          found.push(check.description);
        } else {
          missing.push(check.description);
        }
      }
    }

    // Round total score
    totalScore = Math.round(totalScore * 10) / 10;

    // Build details message
    const passed = totalScore >= this.maxScore * 0.7;
    let details: string;

    if (totalScore >= this.maxScore * 0.8) {
      details = `Well-structured for AI: ${found.join(', ')}`;
    } else if (found.length > 0 && missing.length > 0) {
      details = `Has: ${found.join(', ')}\n   Missing: ${missing.join(', ')}`;
    } else if (missing.length > 0) {
      details = `Missing: ${missing.join(', ')}`;
    } else {
      details = `Has: ${found.join(', ')}`;
    }

    return {
      score: totalScore,
      maxScore: this.maxScore,
      passed,
      details
    };
  }
}
