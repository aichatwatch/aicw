/**
 * Brave Search Indexing Check
 *
 * Checks if the URL/domain is indexed by Brave Search using site: search.
 */

import { BaseSearchIndexingCheck } from './check-indexing-base.js';

const MODULE_NAME = 'Search Index: Brave Search';

export class CheckIndexingBrave extends BaseSearchIndexingCheck {
  readonly name = MODULE_NAME;
  protected readonly searchEngineBaseUrl = 'https://search.brave.com/search';
  protected readonly searchEngineName = 'Brave';

  protected getResultIndicatorPatterns() {
    return [
      'snippet',         // Brave result class
      'result-header',
      /showing [0-9]+ results/i,
      /<article/i        // Brave uses article tags for results
    ];
  }
}
