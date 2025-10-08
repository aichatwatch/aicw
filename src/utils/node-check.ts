/**
 * Node.js version compatibility checking
 */

import { colorize } from './misc-utils.js';
import { CompactLogger } from './compact-logger.js';
const logger = CompactLogger.getInstance();

/**
 * Check if current Node version is compatible
 */
export function checkNodeVersion(): { compatible: boolean; message?: string } {
  const currentVersion = process.version;
  const major = parseInt(currentVersion.slice(1).split('.')[0], 10);
  const minor = parseInt(currentVersion.split('.')[1], 10);

  const MIN_MAJOR = 18; // Node 18 is the current oldest LTS

  if (major < MIN_MAJOR) {
    return {
      compatible: false,
      message: `Node.js ${currentVersion} is too old. Please upgrade to Node.js 18 or newer.\nDownload from: https://nodejs.org/`
    };
  }

  // No maximum version check - support all modern Node.js versions
  // This matches modern tools like Claude Code CLI

  return { compatible: true };
}

/**
 * Display Node version info
 */
export function displayNodeInfo(): void {
  const version = process.version;
  const platform = process.platform;
  const arch = process.arch;

  logger.info(colorize(`Node: ${version} | Platform: ${platform} | Arch: ${arch}`, 'dim'));
}