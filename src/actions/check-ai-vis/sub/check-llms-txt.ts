/**
 * llms.txt Check
 *
 * Checks if /llms.txt file exists and contains content.
 * This is an emerging convention for helping LLMs understand website structure.
 *
 * Reference: https://llmstxt.org/
 *
 * Note: This is a low-priority check (maxScore = 1) as llms.txt is not yet
 * a critical standard for AI visibility.
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';
import { callHttpWithRetry } from '../../../utils/http-caller.js';

const MODULE_NAME = 'Check /llms.txt';

export class CheckLlmsTxt extends BaseVisibilityCheck {
  readonly name = MODULE_NAME;

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    // Note: pageCaptured is not used by this check

    // Construct llms.txt URL
    const urlObj = new URL(url);
    const llmsTxtUrl = `${urlObj.protocol}//${urlObj.host}/llms.txt`;

    try {
      const response = await callHttpWithRetry(llmsTxtUrl, {
        contextInfo: `llms.txt check: ${llmsTxtUrl}`,
        maxRetries: 2  // Don't retry as much for llms.txt
      });

      // If llms.txt doesn't exist - this is common and not critical
      if (response.status === 404) {
        return {
          score: 0,
          maxScore: this.maxScore,
          passed: false,
          details: 'No /llms.txt found (not critical)',
          metadata: { exists: false }
        };
      }

      // Other HTTP errors (403, 500, etc.)
      if (!response.ok) {
        return {
          score: 0,
          maxScore: this.maxScore,
          passed: false,
          details: `Not accessible (HTTP ${response.status})`,
          error: true,
          metadata: { exists: false, httpStatus: response.status }
        };
      }

      // File exists - check if it has content
      const content = await response.text();
      const contentLength = content.trim().length;

      // Score maxScore if present and non-empty, 0 otherwise
      const score = contentLength > 0 ? this.maxScore : 0;
      const passed = score === this.maxScore;

      // Format content length for display
      const sizeDisplay = contentLength >= 1024
        ? `${(contentLength / 1024).toFixed(1)} KB`
        : `${contentLength} bytes`;

      return {
        score,
        maxScore: this.maxScore,
        passed,
        details: contentLength > 0
          ? `Found /llms.txt (${sizeDisplay})`
          : 'Found but empty',
        metadata: {
          exists: true,
          contentLength,
          httpStatus: response.status
        }
      };

    } catch (error: any) {
      // Network errors or other unexpected issues
      return {
        score: 0,
        maxScore: this.maxScore,
        passed: false,
        details: `Error: ${error.message}`,
        error: true,
        metadata: { exists: false }
      };
    }
  }
}
