/**
 * Base Search Engine Indexing Check
 *
 * Abstract base class for checking if a domain is indexed by search engines.
 * Subclasses only need to provide the search URL and result indicator patterns.
 *
 * All common logic (fetching, validation, pattern checking) is handled here.
 */

import { BaseVisibilityCheck, VisibilityCheckResult, NO_SEARCH_RESULTS_PATTERNS, saveResponseToFileIfInDevMode, PageCaptured } from './check-base.js';
import { callHttpWithRetry } from '../../../utils/http-caller.js';
import { DESKTOP_BROWSER_USER_AGENT } from '../../../config/ai-user-agents.js';
import { validateHtmlResponse } from '../utils/response-validator.js';

/**
 * Abstract base class for search engine indexing checks
 * Handles all common logic - subclasses only provide URL and patterns
 */
export abstract class BaseSearchIndexingCheck extends BaseVisibilityCheck {
  /**
   * Search engine base URL (e.g., "https://www.google.com/search")
   * Subclasses must provide this
   */
  protected abstract readonly searchEngineBaseUrl: string;

  /**
   * Search engine name for display and metadata (e.g., "Google")
   * Subclasses must provide this
   */
  protected abstract readonly searchEngineName: string;

  /**
   * Get patterns to detect search results in HTML
   * Subclasses must provide this - returns array of strings or RegExps
   *
   * Examples:
   * - String patterns: checked with html.includes()
   * - RegExp patterns: checked with pattern.test(html)
   */
  protected abstract getResultIndicatorPatterns(): Array<string | RegExp>;

  /**
   * Perform the indexing check
   * All common logic is handled here - subclasses just provide config
   */
  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Build search URL using subclass-provided base URL
    const searchUrl = `${this.searchEngineBaseUrl}?q=site:${encodeURIComponent(domain)}`;

    try {
      const response = await callHttpWithRetry(searchUrl, {
        userAgent: DESKTOP_BROWSER_USER_AGENT,
        headers: {
          'Accept': 'text/html',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        contextInfo: `${this.searchEngineName} indexing check: ${domain}`,
        maxRetries: 1
      });

      if (!response.ok) {
        return this.createResult(false, `HTTP ${response.status}`);
      }

      const html = await response.text();

      // Validate response (checks for error pages, captchas, etc.)
      const validation = validateHtmlResponse(html, response.headers);

      // Save to file in dev mode for debugging
      const filePrefix = this.searchEngineName.toLowerCase().replace(/\s+/g, '-');
      await saveResponseToFileIfInDevMode(html, response.headers, domain, `${filePrefix}-indexing`);

      if (!validation.isValid) {
        return this.createResult(false, `Invalid response: ${validation.reason}`);
      }

      // Check for "no results" patterns (common across all search engines)
      if (NO_SEARCH_RESULTS_PATTERNS.some(pattern => pattern.test(html))) {
        return this.createResult(false, 'No results found');
      }

      // Check for result indicators using subclass-provided patterns
      const patterns = this.getResultIndicatorPatterns();
      const hasResults = patterns.some(pattern => {
        if (typeof pattern === 'string') {
          return html.includes(pattern);
        } else {
          return pattern.test(html);
        }
      });

      if (hasResults) {
        return this.createResult(true, 'Indexed');
      }

      // Uncertain - no clear indicators
      return this.createResult(false, 'Unable to determine (no clear result indicators)');

    } catch (error: any) {
      return this.createResult(false, `Error: ${error.message}`);
    }
  }

  /**
   * Helper to create standardized result
   */
  private createResult(indexed: boolean, details: string): VisibilityCheckResult {
    return {
      score: indexed ? 10 : 0,
      maxScore: this.maxScore,
      passed: indexed,
      details,
      metadata: {
        searchEngine: this.searchEngineName,
        indexed
      }
    };
  }
}
