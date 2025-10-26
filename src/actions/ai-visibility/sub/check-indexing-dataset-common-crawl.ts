import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';
import { callHttpWithRetry } from '../../../utils/http-caller.js';
import { logger } from '../../../utils/compact-logger.js';
import { extractDomainFromUrl } from '../../../utils/url-utils.js';


const MODULE_NAME = 'Dataset: Common Crawl Dataset';
const COMMON_CRAWL_INDEXES_URL = 'https://index.commoncrawl.org/collinfo.json';
// how many indexes to check in Common Crawl
const MAX_INDEXES_TO_CHECK = 3;

/**
 * Get list of available Common Crawl indexes
 * Returns the most recent index names, they are by month
 */
async function getRecentIndexes(limit: number = MAX_INDEXES_TO_CHECK): Promise<string[]> {
  try{    
    const response = await callHttpWithRetry(
      COMMON_CRAWL_INDEXES_URL, 
      {
        contextInfo: 'Fetching Common Crawl index list',
        maxRetries: 2
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch index list: HTTP ${response.status}`);
    }

    const indexes = await response.json();

    // Return the most recent N indexes
    return indexes
      .slice(0, limit)
      .map((idx: any) => idx.id);
  }
  catch(error: any){
    throw new Error(`Failed to fetch Common Crawl index list from ${COMMON_CRAWL_INDEXES_URL} with the error: ${error.message}`);
  }
}

/**
 * Check if URL exists in a specific Common Crawl index
 */
async function checkUrlInIndex(domain: string, indexId: string): Promise<boolean> {
  // Extract domain from URL for querying
  const queryUrl = `https://index.commoncrawl.org/${indexId}-index?url=${encodeURIComponent(domain)}&output=json`;

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
    logger.error(`Failed to check URL ${queryUrl} in the Common Crawl index ${indexId} with the error: ${error.message}`);
    return false;
  }
}

export class CheckIndexingDatasetCommonCrawl extends BaseVisibilityCheck {
  readonly name = MODULE_NAME;

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    try {
      // Get recent indexes
      const indexes = await getRecentIndexes(MAX_INDEXES_TO_CHECK);

      if (indexes.length === 0) {
        throw new Error('No Common Crawl indexes available');
      }

      // getting domain from url
      url = extractDomainFromUrl(url);
      //logger.info(`Checking Common Crawl for URL domain: ${url}`);

      // Check if URL exists in any recent index
      let foundInIndexes: string[] = [];

      // Start progress tracking with try-finally to ensure completion
      try {
        logger.startProgress('Checking', indexes.length, 'Common Crawl indexes');

        for (let i = 0; i < indexes.length; i++) {
          const indexId = indexes[i];
          const found = await checkUrlInIndex(url, indexId);
          if (found) {
            foundInIndexes.push(indexId);
          }

          // Update progress with result
          const statusIcon = found ? '✓' : '○';
          logger.updateProgress(i + 1, `${indexId} ${statusIcon}`);
        }
      } finally {
        // ALWAYS complete progress, even if error occurs
        logger.completeProgress('');
      }

      const isIndexed = foundInIndexes.length > 0;
      const score = isIndexed ? this.maxScore : 0;

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
