/**
 * Search Index Bots Accessibility Check
 *
 * Tests accessibility for bots that index content for AI search features.
 */

import { ServerBaseBotAccessibilityCheck } from './check-server-bot-accessibility-base.js';
import { CRAWLER_BOT_CLASSIFICATION_TAGS } from '../../../config/ai-user-agents.js';

const MODULE_NAME = 'Search Indexes for AI';

export class ServerBotAcessibilitySearchIndex extends ServerBaseBotAccessibilityCheck {
  readonly name = MODULE_NAME;
  protected readonly botTypeFilter = CRAWLER_BOT_CLASSIFICATION_TAGS.AI_SEARCH_INDEX;
}
