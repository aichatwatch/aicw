export const AGGREGATED_DIR_NAME = '_all-questions-combined';
export const AICW_GITHUB_URL = 'https://github.com/aichatwatch/aicw';
export const CITATION_HEADER = '# CITATIONS';
export const CITATION_ITEM_FORMAT_WITH_URL = '{{INDEX}}. [{{TITLE}}]({{URL}})';

/**
 * Maximum number of previous dates to scan for missing entities or historical sources.
 * Only dates with complete answers from all models are considered.
 */
export const MAX_PREVIOUS_DATES = 10;

/**
 * AI Visibility Check - Rate limiting configuration
 * These delays prevent aggressive requests that could trigger rate limiting or bans
 */

/** Delay between main visibility checks (ms) - configurable via AICW_VISIBILITY_CHECK_DELAY_MS */
export const AI_VISIBILITY_CHECK_DELAY_MS =
  parseInt(process.env.AICW_VISIBILITY_CHECK_DELAY_MS || '1500');

/** Delay between individual bot tests (ms) - configurable via AICW_BOT_TEST_DELAY_MS */
export const AI_BOT_TEST_DELAY_MS =
  parseInt(process.env.AICW_BOT_TEST_DELAY_MS || '1000');

/**
 * When true, configs are used directly from the package instead of being copied to user data folder.
 * This skips the copying process and all config loading happens from the package directory.
 * Set via environment variable: AICW_USE_PACKAGE_CONFIG=false
 * Default: true (uses configs from package)
 */
export const USE_PACKAGE_CONFIG = true;// !(process.env.AICW_USE_PACKAGE_CONFIG === 'false');