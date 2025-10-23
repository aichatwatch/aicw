/**
 * Base class for AI visibility checks
 *
 * Provides error handling and standardized result format.
 * Each subclass implements a specific check (robots.txt, meta tags, etc.)
 */

export interface VisibilityCheckResult {
  /** Score earned (0 to maxScore, or -1 for error) */
  score: number;
  /** Maximum possible score for this check */
  maxScore: number;
  /** Whether check passed (score meets threshold) */
  passed: boolean;
  /** Human-readable summary of result */
  details: string;
  /** True if an error occurred during check */
  error?: boolean;
  /** Additional metadata for debugging/logging */
  metadata?: Record<string, any>;
}

/**
 * Abstract base class for visibility checks
 *
 * Handles errors automatically, subclasses only implement the check logic.
 */
export abstract class BaseVisibilityCheck {
  /** Display name for this check */
  abstract readonly name: string;

  /** Maximum score for this check (default 10, override if needed) */
  readonly maxScore: number = 10;

  /**
   * Execute the visibility check
   * Handles errors automatically and returns standardized result
   *
   * @param url - URL to check
   * @param browserHtml - Optional cached HTML content fetched with browser UA
   * @returns Check result with score and details
   */
  async execute(url: string, browserHtml?: string): Promise<VisibilityCheckResult> {
    try {
      return await this.performCheck(url, browserHtml);
    } catch (error: any) {
      // Automatic error handling - return error result
      return {
        score: -1,
        maxScore: this.maxScore,
        passed: false,
        details: `Error: ${error.message}`,
        error: true
      };
    }
  }

  /**
   * Perform the actual check logic
   * Subclasses implement this method
   *
   * @param url - URL to check
   * @param browserHtml - Optional cached HTML content fetched with browser UA
   * @returns Check result
   */
  protected abstract performCheck(url: string, browserHtml?: string): Promise<VisibilityCheckResult>;
}
