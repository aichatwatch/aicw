/**
 * Response Speed Check
 *
 * Evaluates page load speed for both desktop and mobile versions.
 * Fast response times are critical for AI crawlers with timeout constraints.
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';


const MODULE_NAME = 'Server Response Speed';

// Speed thresholds in milliseconds
const EXCELLENT_SPEED = 500;   // < 500ms = excellent
const GOOD_SPEED = 1000;       // < 1000ms = good
const ACCEPTABLE_SPEED = 2000; // < 2000ms = acceptable
const SLOW_SPEED = 3000;       // < 3000ms = slow

function getSpeedScore(timeMs: number): number {
  if (timeMs < EXCELLENT_SPEED) return 5;
  if (timeMs < GOOD_SPEED) return 4;
  if (timeMs < ACCEPTABLE_SPEED) return 3;
  if (timeMs < SLOW_SPEED) return 2;
  return 1;
}

function getSpeedLabel(timeMs: number): string {
  if (timeMs < EXCELLENT_SPEED) return 'excellent';
  if (timeMs < GOOD_SPEED) return 'good';
  if (timeMs < ACCEPTABLE_SPEED) return 'acceptable';
  if (timeMs < SLOW_SPEED) return 'slow';
  return 'very slow';
}

export class CheckResponseSpeed extends BaseVisibilityCheck {
  readonly name = MODULE_NAME;

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    const desktopTime = pageCaptured?.desktopResponseTimeMs;
    const mobileTime = pageCaptured?.mobileResponseTimeMs;

    if (!desktopTime && !mobileTime) {
      throw new Error('Response time data is required for speed check');
    }

    let score = 0;
    const details: string[] = [];

    // Split maxScore between desktop and mobile
    const scorePerDevice = this.maxScore / 2;

    // Desktop speed (half of maxScore)
    if (desktopTime) {
      const desktopScore = getSpeedScore(desktopTime);  // Returns 0-5
      score += (desktopScore / 5) * scorePerDevice;  // Scale to half of maxScore
      details.push(`Desktop: ${desktopTime}ms (${getSpeedLabel(desktopTime)})`);
    }

    // Mobile speed (half of maxScore)
    if (mobileTime) {
      const mobileScore = getSpeedScore(mobileTime);  // Returns 0-5
      score += (mobileScore / 5) * scorePerDevice;  // Scale to half of maxScore
      details.push(`Mobile: ${mobileTime}ms (${getSpeedLabel(mobileTime)})`);
    }

    return {
      score,
      maxScore: this.maxScore,
      passed: score >= 6,
      details: details.join(', '),
      metadata: {
        desktopTime,
        mobileTime,
        desktopLabel: desktopTime ? getSpeedLabel(desktopTime) : undefined,
        mobileLabel: mobileTime ? getSpeedLabel(mobileTime) : undefined
      }
    };
  }
}
