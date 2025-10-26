/**
 * Foundation Model Training Bots Accessibility Check
 *
 * Tests accessibility for bots that collect data for AI foundation model training.
 */

import { ServerBaseBotAccessibilityCheck } from './check-server-bot-accessibility-base.js';
import { CRAWLER_BOT_CLASSIFICATION_TAGS } from '../../../config/ai-user-agents.js';

const MODULE_NAME = 'AI bots access: Data for Training';

export class ServerBotAcessibilityFoundationModelsTraining extends ServerBaseBotAccessibilityCheck {
  readonly name = MODULE_NAME;
  protected readonly botTypeFilter = CRAWLER_BOT_CLASSIFICATION_TAGS.AI_FOUNDATION_MODEL_TRAINING;
}
