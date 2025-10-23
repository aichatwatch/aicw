/**
 * User Interaction Bots Accessibility Check
 *
 * Tests accessibility for bots that fetch content during user interactions.
 */

import { BaseBotAccessibilityCheck } from './check-bot-accessibility-base.js';
import { CRAWLER_BOT_CLASSIFICATION_TAGS } from '../../../config/ai-user-agents.js';

const MODULE_NAME = 'User Interactions with AI';

export class BotAcessibilityUserInteraction extends BaseBotAccessibilityCheck {
  readonly name = MODULE_NAME;
  protected readonly botTypeFilter = CRAWLER_BOT_CLASSIFICATION_TAGS.AI_USER_INTERACTION;
}
