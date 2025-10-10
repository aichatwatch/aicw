/**
 * Action: Show User Data Location
 *
 * Displays the location of user data directories and provides
 * platform-specific commands to open the folder.
 */

import { getProjectNameFromCommandLine, getTargetDateFromProjectOrEnvironment, validateAndLoadProject } from "../../utils/project-utils.js";
import { logger } from "../../utils/compact-logger.js";
// get action name for the current module
import { getModuleNameFromUrl, waitForEnterInInteractiveMode } from '../../utils/misc-utils.js';
import { USER_DATA_DIR, USER_PROJECTS_DIR, USER_REPORTS_DIR, USER_CACHE_DIR, USER_CONFIG_DIR, USER_LOGS_DIR } from "../../config/user-paths.js";
import { platform } from 'os';
import { output, colorize } from '../../utils/output-manager.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);


export async function showUserDataLocation(): Promise<void> {
  // output user data folder location
  logger.info('Location of your data on this computer:');
  output.writeLine(`\n${colorize(USER_DATA_DIR, 'green')}\n`);

  // Show custom user name if configured
  if (process.env.AICW_USER_NAME) {
    logger.info(`User: ${process.env.AICW_USER_NAME}`);
  }

  // Show platform-specific command to open the folder
  const plat = platform();
  logger.info('\nTo open this folder (copy paste to the Terminal/Console app):');
  let command = '';
  if (plat === 'win32') {
    command = `explorer "${USER_DATA_DIR}"`;
  } else if (plat === 'darwin') {
    command = `open "${USER_DATA_DIR}"`;
  } else {
    command = `xdg-open "${USER_DATA_DIR}"`;
  }
  output.writeLine(`\n${colorize(command, 'green')}\n`);

  // Display key subdirectories
  logger.info('Key subdirectories:');
  logger.info(`  projects/ - Your project data`);
  logger.info(`  reports/  - Generated reports`);
  logger.info(`  cache/    - Temporary cache`);
  logger.info(`  config/   - Configuration files`);
  logger.info(`  logs/     - Application logs`);
}

async function main(): Promise<void> {
  //const project = await getProjectNameFromCommandLine();
  //await validateAndLoadProject(project);
  //const targetDate = await getTargetDateFromProjectOrEnvironment(project);

  await showUserDataLocation();
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
