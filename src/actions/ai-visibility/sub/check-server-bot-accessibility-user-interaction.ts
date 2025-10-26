/**
 * User Interaction Bots Accessibility Check
 *
 * Tests accessibility for bots that fetch content during user interactions.
 */

import { ServerBaseBotAccessibilityCheck } from './check-server-bot-accessibility-base.js';
import { CRAWLER_BOT_CLASSIFICATION_TAGS } from '../../../config/ai-user-agents.js';

const MODULE_NAME = 'AI bots access: User Interactions';

export class ServerBotAcessibilityUserInteraction extends ServerBaseBotAccessibilityCheck {
  readonly name = MODULE_NAME;
  protected readonly botTypeFilter = CRAWLER_BOT_CLASSIFICATION_TAGS.AI_USER_INTERACTION;
}
