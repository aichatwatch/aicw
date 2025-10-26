/**
 * Bing Search Indexing Check
 *
 * Checks if the URL/domain is indexed by Bing using site: search.
 */

import { BaseSearchIndexingCheck } from './check-indexing-base.js';

const MODULE_NAME = 'Search Index: Bing';

export class CheckIndexingBing extends BaseSearchIndexingCheck {
  readonly name = MODULE_NAME;
  protected readonly searchEngineBaseUrl = 'https://www.bing.com/search';
  protected readonly searchEngineName = 'Bing';

  protected getResultIndicatorPatterns() {
    return [
      'b_algo',       // Bing result class
      'b_results',
      /[0-9,]+ results/i
    ];
  }
}
