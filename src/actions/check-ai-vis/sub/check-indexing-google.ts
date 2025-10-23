/**
 * Google Indexing Check
 *
 * Checks if the URL/domain is indexed by Google using site: search.
 * Performs a simple HTTP request and looks for result indicators.
 */

import { BaseVisibilityCheck, VisibilityCheckResult, NO_SEARCH_RESULTS_PATTERNS, saveResponseToFileIfInDevMode, PageCaptured } from './check-base.js';
import { callHttpWithRetry } from '../../../utils/http-caller.js';
import { DESKTOP_BROWSER_USER_AGENT } from '../../../config/ai-user-agents.js';
import { validateHtmlResponse } from '../utils/response-validator.js';

const MODULE_NAME = 'Google Indexing';

/**
 * Check if Google has indexed the domain
 */
async function checkGoogleIndexing(url: string): Promise<{ indexed: boolean; details: string }> {
  const urlObj = new URL(url);
  const domain = urlObj.hostname;

  // Use site: search operator
  const searchUrl = `https://www.google.com/search?q=site:${encodeURIComponent(domain)}`;

  try {
    const response = await callHttpWithRetry(searchUrl, {
      userAgent: DESKTOP_BROWSER_USER_AGENT,
      headers: {
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      contextInfo: `Google indexing check: ${domain}`,
      maxRetries: 1
    });

    if (!response.ok) {
      return {
        indexed: false,
        details: `HTTP ${response.status}`
      };
    }

    const html = await response.text();

    // Validate response
    const validation = validateHtmlResponse(html, response.headers);


    await saveResponseToFileIfInDevMode(html, response.headers, domain, 'google-indexing');   

    // If response is invalid (error page, captcha, etc.), report it
    if (!validation.isValid) {
      return {
        indexed: false,
        details: `Invalid response: ${validation.reason}`
      };
    }


    const hasNoResults = NO_SEARCH_RESULTS_PATTERNS.some(pattern => pattern.test(html));

    // Check for result indicators
    const hasResults = html.includes('Search Results') ||
                      html.includes('result-stats') ||
                      /About [0-9,]+ results/i.test(html);

    if (hasNoResults) {
      return {
        indexed: false,
        details: 'No results found'
      };
    }

    if (hasResults) {
      return {
        indexed: true,
        details: 'Indexed'
      };
    }

    // Uncertain - maybe rate limited or captcha
    return {
      indexed: false,
      details: 'Unable to determine (no clear result indicators)'
    };

  } catch (error: any) {
    return {
      indexed: false,
      details: `Error: ${error.message}`
    };
  }
}

export class CheckIndexingGoogle extends BaseVisibilityCheck {
  readonly name = MODULE_NAME;

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    const result = await checkGoogleIndexing(url);

    return {
      score: result.indexed ? 10 : 0,
      maxScore: this.maxScore,
      passed: result.indexed,
      details: result.details,
      metadata: {
        searchEngine: 'Google',
        indexed: result.indexed
      }
    };
  }
}
