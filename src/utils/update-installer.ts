import { spawn } from 'child_process';
import { realpathSync } from 'fs';
import { getPackageRoot } from '../config/user-paths.js';
import { getPackageName, getCurrentVersion, checkForUpdates } from '../utils/update-checker.js';
import { CompactLogger } from './compact-logger.js';
const logger = CompactLogger.getInstance();
/**
 * Check if package is installed via npm link (development mode)
 */
export function isNpmLink(): boolean {
  try {
    const packageRoot = getPackageRoot();
    const realPath = realpathSync(packageRoot);
    // If realPath differs from packageRoot, it's a symlink (npm link)
    return realPath !== packageRoot;
  } catch {
    return false;
  }
}

/**
 * Perform the update installation
 */
export async function performUpdate(): Promise<boolean> {
  const packageName = getPackageName();
  const currentVersion = getCurrentVersion();

  // First, check if update is actually available
  logger.info('🔍 Checking for updates...\n');

  const updateInfo = await checkForUpdates({ force: true });

  if (!updateInfo) {
    logger.info('❌ Unable to check for updates. Please try again later.');
    return false;
  }

  if (!updateInfo.updateAvailable) {
    logger.info(`✅ You're already running the latest version (${currentVersion})`);
    return true;
  }

  logger.info(`📦 Current version: ${currentVersion}`);
  logger.info(`📦 Latest version:  ${updateInfo.latestVersion}\n`);

  // Warn if using npm link
  if (isNpmLink()) {
    logger.info('⚠️  Warning: It looks like you\'re using npm link (development mode).');
    logger.info('   To update, navigate to your development directory and run:');
    logger.info('   git pull && npm install && npm run build\n');
    return false;
  }

  // Confirm update
  const shouldUpdate = await confirmUpdate();
  if (!shouldUpdate) {
    logger.info('\n❌ Update cancelled');
    return false;
  }

  // Perform the update
  logger.info('\n⬇️  Installing update...\n');

  return new Promise((resolve) => {
    const npmProcess = spawn('npm', ['install', '-g', `${packageName}@latest`], {
      stdio: 'pipe',
      shell: true
    });

    let output = '';

    npmProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });

    npmProcess.stderr?.on('data', (data) => {
      output += data.toString();
    });

    npmProcess.on('close', (code) => {
      if (code === 0) {
        logger.info('✅ Update completed successfully!\n');
        logger.info(`🎉 You're now running version ${updateInfo.latestVersion}\n`);
        logger.info('Press Enter to continue...');
        resolve(true);
      } else {
        logger.info('\n❌ Update failed\n');

        // Check for common error patterns
        if (output.includes('EACCES') || output.includes('permission denied')) {
          logger.info('💡 Permission error detected. Try running with sudo:');
          logger.info(`   sudo npm install -g ${packageName}@latest\n`);
        } else if (output.includes('ENOTFOUND') || output.includes('network')) {
          logger.info('💡 Network error detected. Please check your internet connection.\n');
        } else {
          logger.info('💡 Try running manually to see more details:');
          logger.info(`   npm install -g ${packageName}@latest\n`);
        }

        if (output) {
          logger.info('Error output:');
          logger.info(output);
        }

        resolve(false);
      }
    });

    npmProcess.on('error', (error) => {
      logger.info(`\n❌ Update failed: ${error.message}`);
      logger.info('\n💡 Make sure npm is installed and try again.\n');
      resolve(false);
    });
  });
}

/**
 * Prompt user to confirm update
 */
async function confirmUpdate(): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Update now? (y/n): ', (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Show current version
 */
export function showVersion(): void {
  const currentVersion = getCurrentVersion();
  const packageName = getPackageName();
  const installMethod = isNpmLink() ? 'npm-link (development mode)' : 'installed';

  logger.info(`\n📦 ${packageName}`);
  logger.info(`   Version: ${currentVersion}`);
  logger.info(`   Install method: ${installMethod}\n`);
}