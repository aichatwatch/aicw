/**
 * AI Content Structure Check
 *
 * Verifies content is structured for AI search systems (Copilot, ChatGPT, etc.)
 * Based on Microsoft's AI Search optimization guidelines.
 *
 * Reference: https://about.ads.microsoft.com/en/blog/post/october-2025/optimizing-your-content-for-inclusion-in-ai-search-answers
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';

const MODULE_NAME = 'Content: HTML code structure';
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
    description: 'Open Graph title',
    pattern: /<meta\s+property=["']og:title["']\s+content=["'][^"']+["']/i,
    requiredCount: 1
  },
  {
    description: 'Open Graph description',
    pattern: /<meta\s+property=["']og:description["']\s+content=["'][^"']+["']/i,
    requiredCount: 1
  },
  {
    description: 'Open Graph image',
    pattern: /<meta\s+property=["']og:image["']\s+content=["']https?:\/\/[^"']+["']/i,
    requiredCount: 1
  },
  {
    description: 'canonical URL',
    pattern: /<link\s+rel=["']canonical["']/i,
    requiredCount: 1
  },
  {
    description: 'language declaration',
    pattern: /<html[^>]+lang=["'][a-zA-Z-]+["']/i,
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
    description: 'lazy-loaded images',
    pattern: /loading=["']lazy["']/gi,
    requiredCount: 0  // Inverse: we want ZERO lazy-loaded images
  },
  {
    description: 'image alt text',
    patternAllItems: /<img[^>]*>/gi,        // All images
    pattern: /alt=["'][^"']+["']/i,         // Check each for alt attribute
    requiredCount: 1  // Not used for ratio checks
  }
];

export class CheckContentStructure extends BaseVisibilityCheck {
  readonly name = MODULE_NAME;

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

        let score;
        if (check.requiredCount === 0) {
          // INVERSE scoring: penalize for having matches (e.g., lazy-loaded images)
          // 0 matches = full points, >0 matches = reduced points
          score = count === 0 ? pointsPerCheck : Math.max(0, pointsPerCheck * (1 - Math.min(count / 5, 1)));
          totalScore += score;
          if (count === 0) {
            found.push(check.description);
          } else {
            missing.push(`${count} ${check.description}`);
          }
        } else {
          // NORMAL scoring: reward for having matches
          score = Math.min(count / check.requiredCount, 1) * pointsPerCheck;
          totalScore += score;
          if (count >= check.requiredCount) {
            found.push(check.description);
          } else {
            missing.push(check.description);
          }
        }
      }
    }

    // Round total score
    totalScore = Math.round(totalScore * 10) / 10;

    // Build details message
    const passed = totalScore >= this.maxScore * 0.7;
    let details: string;

    if (totalScore >= this.maxScore * 0.8) {
      details = `Good for AI visibility: ${found.join(', ')}`;
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
