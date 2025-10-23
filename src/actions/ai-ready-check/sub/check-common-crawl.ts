/**
 * Common Crawl Dataset Check
 *
 * Checks if the URL exists in Common Crawl's index.
 * Uses Common Crawl's CDX Server API to search for recent captures.
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';
import { callHttpWithRetry } from '../../../utils/http-caller.js';

// checking back 6 indexes
const MAX_INDEXES_TO_CHECK = 6;

/**
 * Get list of available Common Crawl indexes
 * Returns the most recent index names, they are by month
 */
async function getRecentIndexes(limit: number = MAX_INDEXES_TO_CHECK): Promise<string[]> {
  const response = await callHttpWithRetry('https://index.commoncrawl.org/collinfo.json', {
    contextInfo: 'Fetching Common Crawl index list',
    maxRetries: 2
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch index list: HTTP ${response.status}`);
  }

  const indexes = await response.json();

  // Return the most recent N indexes
  return indexes
    .slice(0, limit)
    .map((idx: any) => idx.id);
}

/**
 * Check if URL exists in a specific Common Crawl index
 */
async function checkUrlInIndex(url: string, indexId: string): Promise<boolean> {
  // Extract domain from URL for querying
  const urlObj = new URL(url);
  const queryUrl = `https://index.commoncrawl.org/${indexId}-index?url=${encodeURIComponent(urlObj.href)}&output=json`;

  try {
    const response = await callHttpWithRetry(queryUrl, {
      contextInfo: `Checking Common Crawl index: ${indexId}`,
      maxRetries: 1
    });

    if (!response.ok) {
      return false;
    }

    const text = await response.text();

    // API returns NDJSON (newline-delimited JSON)
    // If there are any results, the text will not be empty
    return text.trim().length > 0;
  } catch (error) {
    return false;
  }
}

export class CheckCommonCrawl extends BaseVisibilityCheck {
  readonly name = 'Common Crawl Dataset';

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    try {
      // Get recent indexes
      const indexes = await getRecentIndexes(MAX_INDEXES_TO_CHECK);

      if (indexes.length === 0) {
        throw new Error('No Common Crawl indexes available');
      }

      // Check if URL exists in any recent index
      let foundInIndexes: string[] = [];

      for (const indexId of indexes) {
        const found = await checkUrlInIndex(url, indexId);
        if (found) {
          foundInIndexes.push(indexId);
        }
      }

      const isIndexed = foundInIndexes.length > 0;
      const score = isIndexed ? 10 : 0;

      return {
        score,
        maxScore: this.maxScore,
        passed: isIndexed,
        details: isIndexed
          ? `Found in ${foundInIndexes.length} recent crawl(s): ${foundInIndexes.join(', ')}`
          : `Not found in ${indexes.length} recent crawls: ${indexes.join(', ')}`,
        metadata: {
          foundInIndexes,
          checkedIndexes: indexes,
          totalChecked: indexes.length
        }
      };
    } catch (error: any) {
      throw new Error(`Common Crawl check failed: ${error.message}`);
    }
  }
}
