/**
 * Sitemap.xml Check
 *
 * Validates presence and basic structure of sitemap.xml.
 * Checks if sitemap exists, is accessible, and contains valid URL entries.
 *
 * Future enhancements:
 * - Check robots.txt for sitemap reference
 * - Validate URL formats
 * - Check lastmod, changefreq, priority
 * - Support nested sitemap indexes
 * - Check for AI-specific extensions
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';
import { callHttpWithRetry } from '../../../utils/http-caller.js';

interface SitemapParseResult {
  isValid: boolean;
  urlCount: number;
  isSitemapIndex: boolean;
  error?: string;
}

const MODULE_NAME = 'Check /sitemap.xml';
/**
 * Parse XML sitemap and extract basic information
 * Minimal parser - validates structure and counts entries
 *
 * @param xmlContent - Raw XML content from sitemap
 * @returns Parse result with validity, counts, and type
 */
function parseSitemap(xmlContent: string): SitemapParseResult {
  const trimmed = xmlContent.trim();

  // Basic XML validation
  if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<')) {
    return { isValid: false, urlCount: 0, isSitemapIndex: false, error: 'Not valid XML' };
  }

  // Detect sitemap type
  const isSitemapIndex = /<sitemapindex/i.test(xmlContent);

  // Validate basic structure
  const hasSitemapTag = /<urlset|<sitemapindex/i.test(xmlContent);
  if (!hasSitemapTag) {
    return {
      isValid: false,
      urlCount: 0,
      isSitemapIndex: false,
      error: 'Missing urlset or sitemapindex tag'
    };
  }

  // Count <loc> entries (works for both regular sitemaps and indexes)
  const locPattern = /<loc[^>]*>(.*?)<\/loc>/gi;
  const matches = xmlContent.match(locPattern) || [];
  const urlCount = matches.length;

  return {
    isValid: true,
    urlCount,
    isSitemapIndex
  };
}

export class CheckSitemap extends BaseVisibilityCheck {
  readonly name = MODULE_NAME;

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    // Note: pageCaptured is not used by this check (we fetch sitemap.xml separately)

    // Construct sitemap.xml URL (standard location)
    const urlObj = new URL(url);
    const sitemapUrl = `${urlObj.protocol}//${urlObj.host}/sitemap.xml`;

    try {
      const response = await callHttpWithRetry(sitemapUrl, {
        contextInfo: `Sitemap check: ${sitemapUrl}`,
        maxRetries: 2  // Don't retry as much for sitemap
      });

      // Sitemap not found - this is common and not an error
      if (response.status === 404) {
        return {
          score: 0,
          maxScore: this.maxScore,
          passed: false,
          details: 'No /sitemap.xml found',
          metadata: { exists: false }
        };
      }

      // Other HTTP errors (403, 500, etc.)
      if (!response.ok) {
        return {
          score: 0,
          maxScore: this.maxScore,
          passed: false,
          details: `Sitemap not accessible (HTTP ${response.status})`,
          error: true,
          metadata: { exists: false, httpStatus: response.status }
        };
      }

      // Fetch and parse sitemap content
      const sitemapContent = await response.text();
      const parseResult = parseSitemap(sitemapContent);

      // Invalid XML structure
      if (!parseResult.isValid) {
        return {
          score: Math.round(this.maxScore * 0.3),
          maxScore: this.maxScore,
          passed: false,
          details: `Sitemap exists but invalid: ${parseResult.error}`,
          metadata: {
            exists: true,
            valid: false,
            error: parseResult.error
          }
        };
      }

      // Valid XML but no entries
      if (parseResult.urlCount === 0) {
        const type = parseResult.isSitemapIndex ? 'sitemap index' : 'sitemap';
        const items = parseResult.isSitemapIndex ? 'sitemaps' : 'URLs';

        return {
          score: Math.round(this.maxScore * 0.5),
          maxScore: this.maxScore,
          passed: false,
          details: `Valid ${type} but contains no ${items}`,
          metadata: {
            exists: true,
            valid: true,
            urlCount: 0,
            isSitemapIndex: parseResult.isSitemapIndex
          }
        };
      }

      // Valid sitemap with entries - success!
      const type = parseResult.isSitemapIndex ? 'sitemap index' : 'sitemap';
      const items = parseResult.isSitemapIndex ? 'sitemaps' : 'URLs';

      return {
        score: this.maxScore,
        maxScore: this.maxScore,
        passed: true,
        details: `Valid ${type} with ${parseResult.urlCount} ${items}`,
        metadata: {
          exists: true,
          valid: true,
          urlCount: parseResult.urlCount,
          isSitemapIndex: parseResult.isSitemapIndex,
          sitemapUrl
        }
      };

    } catch (error: any) {
      // Network errors or other unexpected issues
      return {
        score: -1,
        maxScore: this.maxScore,
        passed: false,
        details: `Error checking sitemap: ${error.message}`,
        error: true
      };
    }
  }
}
