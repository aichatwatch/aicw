/**
 * Google Search Indexing Check
 *
 * Checks if the URL/domain is indexed by Google using site: search.
 */

import { BaseSearchIndexingCheck } from './check-indexing-base.js';

const MODULE_NAME = 'Search Index: Google Search';

export class CheckIndexingGoogle extends BaseSearchIndexingCheck {
  readonly name = MODULE_NAME;
  protected readonly searchEngineBaseUrl = 'https://www.google.com/search';
  protected readonly searchEngineName = 'Google';

  protected getResultIndicatorPatterns() {
    return [
      'Search Results',
      'result-stats',
      /About [0-9,]+ results/i
    ];
  }
}
