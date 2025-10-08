import { promises as fs } from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { PROJECT_DIR as USER_PROJECT_DIR } from '../config/paths.js';
import { waitForEnterInInteractiveMode, writeFileAtomic } from '../utils/misc-utils.js';
import { getUserProjectQuestionFileContent, getUserProjectQuestionsFile, getUserProjectQuestionFilePath } from '../config/user-paths.js';
import { getProjectNameFromCommandLine, getTargetDateFromProjectOrEnvironment, validateAndLoadProject } from '../utils/project-utils.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);
import { CompactLogger } from '../utils/compact-logger.js';
const logger = CompactLogger.getInstance();

const __dirname: string = dirname(fileURLToPath(import.meta.url));
const QUESTIONS_DIR = (project: string): string => path.join(USER_PROJECT_DIR(project), 'questions');

function sanitizeSlug(input: string, maxLen: number = 20): string {
  // Normalize whitespace, remove non-alphanumeric, collapse dashes, lower-case
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return cleaned.substring(0, maxLen) || 'q';
}

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

function parseIndexFromDir(dirName: string): number | null {
  const m = dirName.match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

async function loadExistingQuestionMap(destDir: string): Promise<Map<string, string>> {
  // Map from content-hash -> existing directory name
  const map = new Map<string, string>();
  try {
    const entries = await fs.readdir(destDir, { withFileTypes: true });
    for (const ent of entries as any[]) {
      if (!ent.isDirectory()) continue;
      try {
        // Read question file directly instead of using getUserProjectQuestionFileContent
        // which expects (projectName, questionId) not (questionsDir, questionId)
        const questionFilePath = path.join(destDir, ent.name, 'question.md');
        const content = await fs.readFile(questionFilePath, 'utf-8');
        const h = hashQuestion(content);
        if (!map.has(h)) map.set(h, ent.name);
      } catch {
        throw new Error(`Could not find or read question.md file for ${ent.name} in ${destDir}`);

      }
    }
  } catch {
    throw new Error(`Could not find or read question.md file for ${destDir}`);
  }
  return map;
}

async function nextAvailableIndex(destDir: string, used = new Set<number>()): Promise<number> {
  // Determine smallest positive integer not used by existing folders
  try {
    const entries = await fs.readdir(destDir, { withFileTypes: true });
    for (const ent of entries as any[]) {
      if (!ent.isDirectory()) continue;
      const idx = parseIndexFromDir(ent.name);
      if (idx && idx > 0) used.add(idx);
    }
  } catch {
    throw new Error(`Could not find or read question.md file for ${destDir}`);  
  }
  let i = 1;
  while (used.has(i)) i++;
  return i;
}

async function main(): Promise<void> {
  const project = await getProjectNameFromCommandLine();
  await validateAndLoadProject(project);
  const targetDate = await getTargetDateFromProjectOrEnvironment(project);


  // Use provided path or default location
  const questionsFile: string = getUserProjectQuestionsFile(project);  
  
  try {
    const content: string = await fs.readFile(questionsFile, 'utf-8');
    // Filter out empty lines and comments
    const lines: string[] = content.split(/\r?\n/)
      .map(l => l.trim())
      .filter(line => line && !line.startsWith('#'));

    const destDir: string = QUESTIONS_DIR(project);
    await fs.mkdir(destDir, { recursive: true });

    const existingMap = await loadExistingQuestionMap(destDir);
    const usedIndices = new Set<number>();
    // Preload used indices
    try {
      const entries = await fs.readdir(destDir, { withFileTypes: true });
      for (const ent of entries as any[]) {
        if (!ent.isDirectory()) continue;
        const idx = parseIndexFromDir(ent.name);
        if (idx && idx > 0) usedIndices.add(idx);
      }
    } catch(err) { throw err; }

    let created = 0;
    let reused = 0;
    let duplicates = 0;

    const seenHashes = new Set<string>();

    for (const question of lines) {
      const h = hashQuestion(question);

      // Deduplicate identical questions within the same file
      if (seenHashes.has(h)) {
        duplicates++;
        continue;
      }
      seenHashes.add(h);

      // Check if this question already exists (by hash)
      const existingFolder = existingMap.get(h);
      if (existingFolder) {
        // Question already exists - reuse the folder
        const existingIdx = parseIndexFromDir(existingFolder);
        if (existingIdx) {
          usedIndices.add(existingIdx);
        }
        reused++;
        continue;
      }

      const slug = sanitizeSlug(question, 24);

      // Create a new stable folder with next available index
      const idx = await nextAvailableIndex(destDir, usedIndices);
      usedIndices.add(idx);
      const folderName = `${idx}-${slug}-${h}`;
      await writeFileAtomic(
        getUserProjectQuestionFilePath(project, folderName),
        question);
      created++;
    }

    const total = lines.length - duplicates;
    logger.info(`Questions prepared: ${total} prompts processed in ${destDir}`);
    if (created > 0) logger.info(`  • Created: ${created}`);
    if (reused > 0) logger.info(`  • Reused existing: ${reused}`);
    if (duplicates > 0) logger.info(`  • Skipped duplicates in input: ${duplicates}`);
  } catch (error) {
    console.error(`Error reading questions file: ${questionsFile}`);
    console.error(error);
    throw error;
  }

  // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

  main().catch(err => {
    logger.error('Failed to check models:');
    console.error(err);
    process.exit(1);
  });
