/**
 * X-Robots-Tag HTTP Header Check
 *
 * Checks X-Robots-Tag HTTP headers for blocking directives that prevent AI indexing:
 * - X-Robots-Tag: noindex
 * - X-Robots-Tag: noai
 * - X-Robots-Tag: noimageai
 * - X-Robots-Tag: nosnippet
 *
 * These headers are sent at the HTTP protocol level, before HTML is parsed.
 * Note: This check requires browserHeaders from the pre-fetched response.
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';

const MODULE_NAME = 'Server: X-Robots-Tag HTTP Header Check';

export class CheckServerHttpHeaders extends BaseVisibilityCheck {
  readonly name = MODULE_NAME;

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    // If headers not available, return neutral result
    const browserHeaders = pageCaptured?.browserHeadersDesktop;
    if (!browserHeaders) {
      return {
        score: this.maxScore,
        maxScore: this.maxScore,
        passed: true,
        details: 'Unable to check (headers not available)',
        metadata: { headersAvailable: false }
      };
    }

    // Get all X-Robots-Tag headers (can be multiple)
    const xRobotsValues: string[] = [];

    // Headers.get() only returns the first value, so we need to check all
    browserHeaders.forEach((value, key) => {
      if (key.toLowerCase() === 'x-robots-tag') {
        xRobotsValues.push(value);
      }
    });

    // If no X-Robots-Tag headers, all is good
    if (xRobotsValues.length === 0) {
      return {
        score: this.maxScore,
        maxScore: this.maxScore,
        passed: true,
        details: 'No blocking X-Robots-Tag headers found (all good)',
        metadata: { xRobotsTagPresent: false }
      };
    }

    // Parse directives from headers (comma-separated values)
    const blockingDirectives = /\b(noindex|noai|noimageai|nosnippet)\b/i;
    const foundBlockingDirectives: string[] = [];

    for (const headerValue of xRobotsValues) {
      const directives = headerValue.split(',').map(d => d.trim());
      for (const directive of directives) {
        if (blockingDirectives.test(directive)) {
          foundBlockingDirectives.push(directive);
        }
      }
    }

    // Calculate score
    const hasBlockingDirective = foundBlockingDirectives.length > 0;
    const score = hasBlockingDirective ? 0 : this.maxScore;

    return {
      score,
      maxScore: this.maxScore,
      passed: !hasBlockingDirective,
      details: hasBlockingDirective
        ? `Found blocking: X-Robots-Tag: ${foundBlockingDirectives.join(', ')}`
        : 'No blocking X-Robots-Tag directives',
      metadata: {
        xRobotsTagPresent: true,
        headerValues: xRobotsValues,
        blockingDirectives: foundBlockingDirectives
      }
    };
  }
}
