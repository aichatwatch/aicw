/**
 * Cleanup Orphaned Question Folders
 *
 * Removes question folders that no longer have corresponding entries in questions.md.
 * This prevents accumulation of old/renamed questions over time.
 *
 * What gets deleted:
 * - Question folders whose content hash doesn't match any question in questions.md
 *
 * What is PRESERVED:
 * - Question folders with matching hashes (even if index changed)
 * - All data-compiled/ subdirectories (historical data)
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { QUESTIONS_DIR } from '../config/paths.js';
import { logger } from '../utils/compact-logger.js';
import { waitForEnterInInteractiveMode } from '../utils/misc-utils.js';
import { getProjectNameFromCommandLine, validateAndLoadProject } from '../utils/project-utils.js';
import { PipelineCriticalError } from '../utils/pipeline-errors.js';
import { getUserProjectQuestionsFile } from '../config/user-paths.js';
import { getModuleNameFromUrl } from '../utils/misc-utils.js';

const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

/**
 * Hash function matching prepare-questions.ts
 */
function hashQuestion(question: string): string {
  // Normalize question for stable hashing:
  // - Convert to lowercase
  // - Collapse multiple spaces to single space
  // - Trim leading/trailing whitespace
  const normalized = question
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 8);
}

/**
 * Load all question hashes from questions.md
 */
async function loadCurrentQuestionHashes(project: string): Promise<Set<string>> {
  const questionsFile = getUserProjectQuestionsFile(project);
  const content = await fs.readFile(questionsFile, 'utf-8');

  // Filter out empty lines and comments
  const lines = content.split(/\r?\n/)
    .map(l => l.trim())
    .filter(line => line && !line.startsWith('#'));

  const hashes = new Set<string>();
  for (const question of lines) {
    const h = hashQuestion(question);
    hashes.add(h);
  }

  return hashes;
}

/**
 * Remove orphaned question folders
 */
async function cleanupOrphanedQuestions(project: string): Promise<void> {
  logger.info(`Checking for orphaned question folders in project: ${project}`);

  const questionsDir = QUESTIONS_DIR(project);

  // Load current question hashes
  const currentHashes = await loadCurrentQuestionHashes(project);
  logger.debug(`Found ${currentHashes.size} questions in questions.md`);

  // Get all question folders
  let entries;
  try {
    entries = await fs.readdir(questionsDir, { withFileTypes: true });
  } catch (error) {
    logger.warn(`Questions directory not found: ${questionsDir}`);
    return;
  }

  const questionFolders = entries.filter(e =>
    e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')
  );

  logger.debug(`Found ${questionFolders.length} question folders`);

  // Start progress tracking
  logger.startProgress(questionFolders.length, 'folders');

  let deletedCount = 0;
  let preservedCount = 0;

  for (const [index, folder] of questionFolders.entries()) {
    const currentIndex = index + 1;
    logger.updateProgress(currentIndex, `Checking ${folder.name}...`);

    try {
      // Read the question file
      const questionFile = path.join(questionsDir, folder.name, 'question.md');
      const questionContent = await fs.readFile(questionFile, 'utf-8');
      const folderHash = hashQuestion(questionContent);

      // Check if this hash exists in current questions
      if (currentHashes.has(folderHash)) {
        // This folder is still valid
        logger.updateProgress(currentIndex, `${folder.name} - preserved`);
        preservedCount++;
      } else {
        // This folder is orphaned - delete it
        const folderPath = path.join(questionsDir, folder.name);
        await fs.rm(folderPath, { recursive: true, force: true });
        logger.updateProgress(currentIndex, `${folder.name} - deleted (orphaned)`);
        logger.info(`Deleted orphaned folder: ${folder.name}`);
        deletedCount++;
      }
    } catch (error) {
      logger.warn(`Could not process folder ${folder.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Complete progress
  logger.completeProgress(`Cleanup complete`);

  // Add summary stats
  logger.addStat('Preserved', preservedCount);
  logger.addStat('Deleted', deletedCount);

  logger.info(`Orphaned question cleanup complete. Preserved: ${preservedCount}, Deleted: ${deletedCount}`);
}

// CLI entry point
async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
  await validateAndLoadProject(project);

  // Initialize logger
  await logger.initialize(import.meta.url, project);

  await cleanupOrphanedQuestions(project);

  await logger.showSummary();
  await waitForEnterInInteractiveMode();
}

main().catch(err => {
  logger.error(err.message || err.toString());
  throw err;
});
