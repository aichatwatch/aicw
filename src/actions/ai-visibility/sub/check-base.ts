/**
 * Base class for AI visibility checks
 *
 * Provides error handling and standardized result format.
 * Each subclass implements a specific check (robots.txt, meta tags, etc.)
 */

import { mkdir, writeFile } from "fs/promises";
import { USER_LOGS_DIR } from "../../../config/user-paths.js";
import { join } from "path";
import { logger } from "../../../utils/compact-logger.js";

// Check for "no results" indicators
export const NO_SEARCH_RESULTS_PATTERNS = [
  /No results found/i,
  /couldn't find any results/i,
  /didn't match any results/i,
  /0 results/i,
  /Too few matches were found/i,
  /No results found for/i,
  /There are no results for/i,
];


export async function saveResponseToFileIfInDevMode(
  html: string, 
  headers: Headers, 
  domain: string, 
  prefix: string
): Promise<void> {
  const isDev = process.env.AICW_DEV_MODE === 'true' || process.env.NODE_ENV === 'development';
  if (!isDev) return;

  try {
    // Ensure logs directory exists
    await mkdir(USER_LOGS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `${prefix}-${domain}-${timestamp}.html`;
    const filepath = join(USER_LOGS_DIR, filename);
    await writeFile(filepath, html, 'utf-8');
  } catch (err) {
    logger.error(`Error saving response to file in dev mode: ${err}`);
  }
}

/**
 * Captured page data for both desktop and mobile with timing information
 */
export interface PageCaptured {
  /** Desktop browser HTML content */
  browserHtmlDesktop?: string;
  /** Mobile browser HTML content */
  browserHtmlMobile?: string;
  /** Desktop HTTP response headers */
  browserHeadersDesktop?: Headers;
  /** Mobile HTTP response headers */
  browserHeadersMobile?: Headers;
  /** Desktop response time in milliseconds */
  desktopResponseTimeMs?: number;
  /** Mobile response time in milliseconds */
  mobileResponseTimeMs?: number;
  /** Desktop HTTP status code */
  desktopStatusCode?: number;
  /** Mobile HTTP status code */
  mobileStatusCode?: number;
  /** When desktop page was fetched */
  desktopFetchedAt?: Date;
  /** When mobile page was fetched */
  mobileFetchedAt?: Date;
  /** Cached robots.txt content (undefined if not fetched or 404) */
  robotsTxtContent?: string;
  /** HTTP status from robots.txt fetch */
  robotsTxtStatus?: number;
  /** Cached sitemap.xml content (undefined if not fetched or 404) */
  sitemapXmlContent?: string;
  /** HTTP status from sitemap.xml fetch */
  sitemapXmlStatus?: number;
}

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

  /** Maximum score for this check (set from configuration) */
  public maxScore!: number;

  /**
   * Set the maximum score for this check
   * Called during instantiation with configured weight
   */
  setMaxScore(score: number): this {
    this.maxScore = score;
    return this;
  }

  /**
   * Execute the visibility check
   * Handles errors automatically and returns standardized result
   *
   * @param url - URL to check
   * @param pageCaptured - Captured page data for desktop and mobile
   * @returns Check result with score and details
   */
  async execute(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    try {
      return await this.performCheck(url, pageCaptured);
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
   * @param pageCaptured - Captured page data for desktop and mobile
   * @returns Check result
   */
  protected abstract performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult>;
}
