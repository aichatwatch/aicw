/**
 * Mobile Compatibility Check
 *
 * Verifies that the website provides a valid mobile version and compares it to desktop.
 * Checks:
 * - Mobile version accessibility (200 status, valid content)
 * - Mobile-specific meta tags (viewport)
 * - Content similarity between mobile and desktop
 * - Response time comparison
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';

// Minimum valid HTML size to avoid error pages
const MIN_VALID_HTML_SIZE = 500;

// Tolerance for content size difference (20% - mobile often differs more than bot content)
const CONTENT_SIZE_TOLERANCE = 0.20;

/**
 * Check if mobile and desktop content sizes are similar
 */
function isContentSimilar(desktopSize: number, mobileSize: number, tolerance: number = CONTENT_SIZE_TOLERANCE): boolean {
  const diff = Math.abs(desktopSize - mobileSize);
  const avgSize = (desktopSize + mobileSize) / 2;

  if (avgSize === 0) {
    return desktopSize === 0 && mobileSize === 0;
  }

  return (diff / avgSize) <= tolerance;
}

/**
 * Check for mobile-specific meta tags
 */
function hasMobileMetaTags(html: string): boolean {
  // Check for viewport meta tag (critical for mobile)
  const hasViewport = /<meta\s+name=["']viewport["']/i.test(html);
  return hasViewport;
}

export class CheckContentMobileCompatibility extends BaseVisibilityCheck {
  readonly name = 'Mobile Version Availability';

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    // Require both desktop and mobile data
    const desktopHtml = pageCaptured?.browserHtmlDesktop;
    const mobileHtml = pageCaptured?.browserHtmlMobile;
    const desktopStatus = pageCaptured?.desktopStatusCode;
    const mobileStatus = pageCaptured?.mobileStatusCode;
    const desktopTime = pageCaptured?.desktopResponseTimeMs;
    const mobileTime = pageCaptured?.mobileResponseTimeMs;

    // If desktop data is missing, we can't perform this check
    if (!desktopHtml || !desktopStatus) {
      throw new Error('Desktop HTML is required for mobile compatibility check');
    }

    // If mobile data is missing, it's a failed check
    if (!mobileHtml || !mobileStatus) {
      return {
        score: 0,
        maxScore: this.maxScore,
        passed: false,
        details: 'Mobile version not accessible',
        metadata: {
          mobileAvailable: false,
          reason: 'No mobile response data'
        }
      };
    }

    let score = 0;
    const issues: string[] = [];
    const metadata: Record<string, any> = {
      desktopSize: desktopHtml.length,
      mobileSize: mobileHtml.length,
      desktopStatus,
      mobileStatus,
      desktopTime,
      mobileTime
    };

    // Define scoring weights (sum to 1.0)
    const WEIGHTS = {
      status200: 0.30,      // 30% of maxScore
      validContent: 0.30,   // 30% of maxScore
      viewportTag: 0.20,    // 20% of maxScore
      similarity: 0.20      // 20% of maxScore
    };

    // Check 1: Mobile returns 200 status (30% of maxScore)
    if (mobileStatus === 200) {
      score += this.maxScore * WEIGHTS.status200;
    } else {
      issues.push(`Mobile HTTP ${mobileStatus}`);
    }

    // Check 2: Mobile content is valid size (30% of maxScore)
    if (mobileHtml.length >= MIN_VALID_HTML_SIZE) {
      score += this.maxScore * WEIGHTS.validContent;
    } else {
      issues.push('Mobile content too small');
    }

    // Check 3: Mobile has viewport meta tag (20% of maxScore)
    const hasMobileTags = hasMobileMetaTags(mobileHtml);
    if (hasMobileTags) {
      score += this.maxScore * WEIGHTS.viewportTag;
      metadata.hasViewportTag = true;
    } else {
      issues.push('Missing viewport meta tag');
      metadata.hasViewportTag = false;
    }

    // Check 4: Content similarity between desktop and mobile (20% of maxScore)
    const similar = isContentSimilar(desktopHtml.length, mobileHtml.length);
    if (similar) {
      score += this.maxScore * WEIGHTS.similarity;
      metadata.contentSimilar = true;
    } else {
      metadata.contentSimilar = false;
      // Not added as issue - this is sometimes expected
    }

    // Build details message
    const passingThreshold = this.maxScore * 0.8;  // 80% of maxScore
    let details: string;
    if (score >= passingThreshold) {
      const timeDiff = mobileTime && desktopTime ? mobileTime - desktopTime : 0;
      const timeNote = timeDiff !== 0 ? ` (${timeDiff > 0 ? '+' : ''}${timeDiff}ms vs desktop)` : '';
      details = `Mobile version available and optimized${timeNote}`;
    } else if (score === 0) {
      details = `Mobile version unavailable or broken\n   Issues: ${issues.join(', ')}`;
    } else {
      details = `Mobile version available with issues\n   Issues: ${issues.join(', ')}`;
    }

    return {
      score,
      maxScore: this.maxScore,
      passed: score >= passingThreshold,
      details,
      metadata
    };
  }
}
