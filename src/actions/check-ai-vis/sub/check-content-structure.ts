/**
 * AI Content Structure Check - Config-Driven Approach
 *
 * Verifies content is structured for AI search systems (Copilot, ChatGPT, etc.)
 * Based on Microsoft's AI Search optimization guidelines.
 *
 * Reference: https://about.ads.microsoft.com/en/blog/post/october-2025/optimizing-your-content-for-inclusion-in-ai-search-answers
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';

/**
 * Check types supported by the content structure validator
 */
type CheckType = 'exact-count' | 'tiered-count' | 'presence' | 'ratio';

/**
 * Result from running a single check
 */
interface CheckResult {
  score: number;
  found: boolean;
  count?: number;
  ratio?: number;
  message: string;
}

/**
 * Configuration for a single content check
 */
interface ContentCheckConfig {
  id: string;
  name: string;
  maxPoints: number;
  type: CheckType;

  // Pattern(s) to match
  pattern?: RegExp;
  patterns?: RegExp[];  // For multi-pattern checks (e.g., H2 + H3)

  // Scoring rules based on type
  exactCount?: number;        // For exact-count: must be exactly this

  // Tiered scoring (for progressive points)
  tiers?: Array<{
    threshold: number;  // Count or ratio threshold
    points: number;     // Points awarded
  }>;

  // Ratio-specific (for image alt text)
  altPattern?: RegExp;  // Pattern to check for alt attribute

  // Messages
  messages: {
    missing: string;
    found?: string | ((value: number) => string);
  };
}

/**
 * Content checks configuration
 * Note: maxPoints here are relative weights, will be scaled to actual maxScore in performCheck()
 */
const CONTENT_CHECKS: ContentCheckConfig[] = [
  // Check 1: H1 - Exactly 1
  {
    id: 'h1-tag',
    name: 'H1 tag',
    type: 'exact-count',
    pattern: /<h1[^>]*>/gi,
    exactCount: 1,
    maxPoints: 2,
    messages: {
      missing: 'H1 tag',
      found: 'H1 tag'
    }
  },

  // Check 2: H2/H3 - Tiered scoring
  {
    id: 'headings',
    name: 'headings',
    type: 'tiered-count',
    patterns: [/<h2[^>]*>/gi, /<h3[^>]*>/gi],
    maxPoints: 3,
    tiers: [
      { threshold: 5, points: 3 },
      { threshold: 2, points: 2 },
      { threshold: 1, points: 1 }
    ],
    messages: {
      missing: 'H2/H3 headings',
      found: (count) => `${count} heading${count > 1 ? 's' : ''}`
    }
  },

  // Check 3: Meta description - Presence
  {
    id: 'meta-desc',
    name: 'meta description',
    type: 'presence',
    pattern: /<meta\s+name=["']description["']\s+content=["'][^"']+["']/i,
    maxPoints: 2,
    messages: {
      missing: 'meta description',
      found: 'meta description'
    }
  },

  // Check 4: Lists - Presence
  {
    id: 'lists',
    name: 'lists',
    type: 'presence',
    pattern: /<(ul|ol)[^>]*>/i,
    maxPoints: 1,
    messages: {
      missing: 'lists',
      found: 'lists'
    }
  },

  // Check 5: Tables - Presence
  {
    id: 'tables',
    name: 'tables',
    type: 'presence',
    pattern: /<table[^>]*>/i,
    maxPoints: 1,
    messages: {
      missing: 'tables',
      found: 'tables'
    }
  },

  // Check 6: Image alt text - Ratio-based
  {
    id: 'img-alt',
    name: 'image alt text',
    type: 'ratio',
    pattern: /<img[^>]*>/gi,
    altPattern: /alt=["'][^"']+["']/i,
    maxPoints: 1,
    tiers: [
      { threshold: 0.8, points: 1 },
      { threshold: 0.5, points: 0.5 }
    ],
    messages: {
      missing: 'image alt text',
      found: (pct) => `${pct}% images with alt`
    }
  }
];

/**
 * Total raw points from configuration (used for scaling to actual maxScore)
 */
const TOTAL_RAW_POINTS = CONTENT_CHECKS.reduce((sum, check) => sum + check.maxPoints, 0);

/**
 * Check for exact count match
 */
function checkExactCount(config: ContentCheckConfig, html: string): CheckResult {
  const matches = html.match(config.pattern!) || [];
  const count = matches.length;

  if (count === config.exactCount) {
    return {
      score: config.maxPoints,
      found: true,
      count,
      message: typeof config.messages.found === 'string'
        ? config.messages.found
        : config.messages.found!(count)
    };
  }

  // Wrong count
  const message = count === 0
    ? config.messages.missing
    : `single ${config.name} (found ${count})`;

  return {
    score: 0,
    found: false,
    count,
    message
  };
}

/**
 * Check for tiered count (progressive scoring)
 */
function checkTieredCount(config: ContentCheckConfig, html: string): CheckResult {
  let totalCount = 0;

  // Count matches across all patterns
  for (const pattern of config.patterns!) {
    const matches = html.match(pattern) || [];
    totalCount += matches.length;
  }

  // Find matching tier (assume sorted high to low)
  const sortedTiers = [...config.tiers!].sort((a, b) => b.threshold - a.threshold);

  for (const tier of sortedTiers) {
    if (totalCount >= tier.threshold) {
      const message = typeof config.messages.found === 'function'
        ? config.messages.found(totalCount)
        : config.messages.found!;

      return {
        score: tier.points,
        found: true,
        count: totalCount,
        message
      };
    }
  }

  // No tier matched
  return {
    score: 0,
    found: false,
    count: totalCount,
    message: config.messages.missing
  };
}

/**
 * Check for presence (boolean check)
 */
function checkPresence(config: ContentCheckConfig, html: string): CheckResult {
  const isPresent = config.pattern!.test(html);

  if (isPresent) {
    return {
      score: config.maxPoints,
      found: true,
      message: typeof config.messages.found === 'string'
        ? config.messages.found
        : config.messages.found!(1)
    };
  }

  return {
    score: 0,
    found: false,
    message: config.messages.missing
  };
}

/**
 * Check for ratio (e.g., percentage of images with alt text)
 */
function checkRatio(config: ContentCheckConfig, html: string): CheckResult {
  const allMatches = html.match(config.pattern!) || [];
  const totalCount = allMatches.length;

  // If no items to check, give full points (don't penalize)
  if (totalCount === 0) {
    return {
      score: config.maxPoints,
      found: true,
      ratio: 1,
      message: 'no images (N/A)'
    };
  }

  // Count items with the required attribute
  const matchesWithAttr = allMatches.filter(item => config.altPattern!.test(item));
  const ratio = matchesWithAttr.length / totalCount;
  const percentage = Math.round(ratio * 100);

  // Find matching tier
  const sortedTiers = [...config.tiers!].sort((a, b) => b.threshold - a.threshold);

  for (const tier of sortedTiers) {
    if (ratio >= tier.threshold) {
      const message = typeof config.messages.found === 'function'
        ? config.messages.found(percentage)
        : config.messages.found!;

      return {
        score: tier.points,
        found: true,
        ratio,
        count: totalCount,
        message
      };
    }
  }

  // Below all tiers
  return {
    score: 0,
    found: false,
    ratio,
    count: totalCount,
    message: config.messages.missing
  };
}

/**
 * Run a check based on its type
 */
function runCheck(config: ContentCheckConfig, html: string): CheckResult {
  switch (config.type) {
    case 'exact-count':
      return checkExactCount(config, html);
    case 'tiered-count':
      return checkTieredCount(config, html);
    case 'presence':
      return checkPresence(config, html);
    case 'ratio':
      return checkRatio(config, html);
    default:
      throw new Error(`Unknown check type: ${config.type}`);
  }
}

export class CheckContentStructure extends BaseVisibilityCheck {
  readonly name = 'Content Structure for AI';

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    const browserHtml = pageCaptured?.browserHtmlDesktop;
    if (!browserHtml) {
      throw new Error('HTML content is required for content structure check');
    }

    let totalScore = 0;
    const found: string[] = [];
    const missing: string[] = [];
    const metadata: Record<string, any> = {};

    // Run all checks from configuration and scale to maxScore
    for (const config of CONTENT_CHECKS) {
      const result = runCheck(config, browserHtml);

      // Scale raw score to proportion of maxScore
      const scaledScore = (result.score / TOTAL_RAW_POINTS) * this.maxScore;
      totalScore += scaledScore;

      metadata[config.id] = {
        rawScore: result.score,
        scaledScore,
        count: result.count,
        ratio: result.ratio,
        found: result.found
      };

      if (result.found) {
        found.push(result.message);
      } else if (result.score === 0) {
        missing.push(result.message);
      }
    }

    // Round total score
    totalScore = Math.round(totalScore * 10) / 10;

    // Passing thresholds based on maxScore
    const excellentThreshold = this.maxScore * 0.8;  // 80% = well-structured
    const passingThreshold = this.maxScore * 0.7;    // 70% = passing

    // Build details message
    let details: string;
    if (totalScore >= excellentThreshold) {
      details = `Well-structured for AI: ${found.join(', ')}`;
    } else if (totalScore === 0) {
      details = `Poor structure for AI\n   Missing: ${missing.join(', ')}`;
    } else {
      const parts: string[] = [];
      if (found.length > 0) {
        parts.push(`Has: ${found.join(', ')}`);
      }
      if (missing.length > 0) {
        parts.push(`Missing: ${missing.join(', ')}`);
      }
      details = parts.join('\n   ');
    }

    return {
      score: totalScore,
      maxScore: this.maxScore,
      passed: totalScore >= passingThreshold,
      details,
      metadata
    };
  }
}
