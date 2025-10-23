/**
 * Search Index Bots Accessibility Check
 *
 * Tests accessibility for bots that index content for AI search features.
 */

import { BaseBotAccessibilityCheck } from './check-bot-accessibility-base.js';
import { CRAWLER_BOT_CLASSIFICATION_TAGS } from '../../../config/ai-user-agents.js';

const MODULE_NAME = 'Search Indexes for AI';

export class BotAcessibilitySearchIndex extends BaseBotAccessibilityCheck {
  readonly name = MODULE_NAME;
  protected readonly botTypeFilter = CRAWLER_BOT_CLASSIFICATION_TAGS.AI_SEARCH_INDEX;
}
