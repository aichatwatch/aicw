/**
 * Action: Stop Pipeline
 *
 * Throws an exception to immediately halt the pipeline.
 * Can be used as a placeholder or to intentionally abort execution.
 */

import { PipelineCriticalError } from "../utils/pipeline-errors.js";
import { getProjectNameFromCommandLine, getTargetDateFromProjectOrEnvironment, validateAndLoadProject } from "../utils/project-utils.js";
import { logger } from "../utils/compact-logger.js";
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);


export async function actionStop(): Promise<void> {
  throw new PipelineCriticalError('Pipeline execution stopped by action-stop.', CURRENT_MODULE_NAME);
}

async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
  await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);

  await actionStop();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
  // Don't exit - let the error bubble up
});
