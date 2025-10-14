export const AGGREGATED_DIR_NAME = '_all-questions-combined';
export const AICW_GITHUB_URL = 'https://github.com/aichatwatch/aicw';

/**
 * When true, configs are used directly from the package instead of being copied to user data folder.
 * This skips the copying process and all config loading happens from the package directory.
 * Set via environment variable: AICW_USE_PACKAGE_CONFIG=false
 * Default: true (uses configs from package)
 */
export const USE_PACKAGE_CONFIG = true;// !(process.env.AICW_USE_PACKAGE_CONFIG === 'false');