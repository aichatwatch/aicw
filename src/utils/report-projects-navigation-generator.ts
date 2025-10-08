import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { USER_REPORTS_DIR, DEFAULT_INDEX_FILE, getPackageTemplatesDir, getProjectNameFromProjectFolder, getCurrentDateTimeAsString } from '../config/user-paths.js';
import { replaceMacrosInTemplate, writeFileAtomic } from './misc-utils.js';
import { logger } from './compact-logger.js';

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Template paths - use centralized function
const NAVIGATION_TEMPLATES_DIR = path.join(getPackageTemplatesDir(), 'navigation');

// Metadata file to track generation times
const NAV_META_FILE = '.navigation-meta.json';

const DEFAULT_EMPTY_STATE = `<!-- No projects, empty state not needed -->`;

interface NavigationMetadata {
  lastGenerated: string;
  projectTimestamps: Record<string, number>;
}

/**
 * Load HTML template and replace placeholders
 */
async function loadNavigationTemplate(templateName: string): Promise<string> {
  const templatePath = path.join(NAVIGATION_TEMPLATES_DIR, `${templateName}.html`);
  const content = await fs.readFile(templatePath, 'utf-8');

  const now = new Date();
  const generationTime = now.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true  
  });

  // Replace placeholders

  const filled = await replaceMacrosInTemplate(content, {
    '{{YEAR}}': now.getFullYear().toString(),
    '{{GENERATION_TIME}}': generationTime
  },
  false);

  return filled;
}

/**
 * Get modification time of a directory
 */
async function getDirectoryMTime(dirPath: string): Promise<number> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Check if navigation needs regeneration
 */
async function needsRegeneration(outputDir: string, projects?: string[]): Promise<boolean> {
  const metaPath = path.join(outputDir, NAV_META_FILE);

  if (!existsSync(metaPath)) {
    return true; // No metadata, need to generate
  }

  try {
    const metaContent = await fs.readFile(metaPath, 'utf-8');
    const metadata: NavigationMetadata = JSON.parse(metaContent);

    // Check specific projects if provided
    if (projects && projects.length > 0) {
      for (const project of projects) {
        const projectDir = path.join(outputDir, 'projects', project);
        const currentMTime = await getDirectoryMTime(projectDir);
        const lastMTime = metadata.projectTimestamps[project] || 0;

        if (currentMTime > lastMTime) {
          return true; // Project has changed
        }
      }
      return false; // No changes in specified projects
    }

    // Check all projects
    const projectsDir = path.join(outputDir, 'projects');
    if (!existsSync(projectsDir)) {
      return false; // No projects directory yet
    }

    const projectDirs = await fs.readdir(projectsDir, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;

      const projectDir = path.join(projectsDir, dir.name);
      const currentMTime = await getDirectoryMTime(projectDir);
      const lastMTime = metadata.projectTimestamps[dir.name] || 0;

      if (currentMTime > lastMTime) {
        return true; // Project has changed
      }
    }

    return false; // No changes detected
  } catch {
    return true; // Error reading metadata, regenerate
  }
}

/**
 * Update navigation metadata
 */
async function updateMetadata(outputDir: string): Promise<void> {
  const metaPath = path.join(outputDir, NAV_META_FILE);
  const projectsDir = path.join(outputDir, 'projects');

  const metadata: NavigationMetadata = {
    lastGenerated: new Date().toISOString(),
    projectTimestamps: {}
  };

  if (existsSync(projectsDir)) {
    const projectDirs = await fs.readdir(projectsDir, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;

      const projectDir = path.join(projectsDir, dir.name);
      metadata.projectTimestamps[dir.name] = await getDirectoryMTime(projectDir);
    }
  }

  await writeFileAtomic(metaPath, JSON.stringify(metadata, null, 2));
}

/**
 * Generate home page with projects directly
 */
async function generateHomePageWithProjects(outputDir: string): Promise<void> {
  const projectsDir = path.join(outputDir, 'projects');

  // Ensure projects directory exists
  await fs.mkdir(projectsDir, { recursive: true });

  const template = await loadNavigationTemplate('home');
  let projectCards = '';

  try {
    const dirs = await fs.readdir(projectsDir, { withFileTypes: true });
    const projects = dirs
      .filter(d => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const project of projects) {
      const projectPath = path.join(projectsDir, project.name);
      const stats = await fs.stat(projectPath);
      const formattedDate = new Date(stats.mtime).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      // Find the latest report date for this project
      let latestReportLink = `./projects/${project.name}/${DEFAULT_INDEX_FILE}`;
      let hasReports = false;
      try {
        const projectDirs = await fs.readdir(projectPath, { withFileTypes: true });
        const dateDirs = projectDirs
          .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
          .map(d => d.name)
          .sort()
          .reverse(); // Most recent first

        // Find the first date that has a report
        for (const dateDir of dateDirs) {
          const reportPath = path.join(projectPath, dateDir, DEFAULT_INDEX_FILE);
          if (existsSync(reportPath)) {
            latestReportLink = `./projects/${project.name}/${dateDir}/${DEFAULT_INDEX_FILE}`;
            hasReports = true;
            break;
          }
        }
      } catch {
        // Error reading project directory, use default link
      }

      const cardMacros = {
        "{{PROJECT_NAME}}": getProjectNameFromProjectFolder(project.name),
        "{{PROJECT_ID}}": project.name,
        "{{LATEST_REPORT_LINK}}": latestReportLink,
        "{{REPORT_DATE}}": formattedDate
      };

      // Load the appropriate card template
      let cardTemplate = '';
      if(hasReports) {
        cardTemplate = await loadNavigationTemplate('project-card-with-reports');
        // adding report title to the card macros
        cardMacros["{{REPORT_TITLE}}"] = project.name.replace(/_/g, ' ');
      } else {
        cardTemplate = await loadNavigationTemplate('project-card');
      }

      // Replace macros in the CARD template (not the home template!)
      const filledCard = await replaceMacrosInTemplate(cardTemplate, cardMacros);      

      // Now append the filled card
      projectCards += filledCard;

    }
  } catch (err) {
    throw err
  }

  // Handle empty state
  let emptyState = DEFAULT_EMPTY_STATE;
  if (!projectCards) {
    emptyState = await loadNavigationTemplate('empty-state');
  }

  let html = await  replaceMacrosInTemplate(template, {
    "{{PROJECT_CARDS}}": projectCards,
    "{{EMPTY_STATE}}": emptyState
  });    

  const outputPath = path.join(outputDir, 'index.html');
  await writeFileAtomic(outputPath, html);
}

/**
 * Generate project detail page with date folders
 */
async function generateProjectDetail(outputDir: string, projectName: string): Promise<void> {
  const projectDir = path.join(outputDir, 'projects', projectName);

  // Ensure project directory exists
  await fs.mkdir(projectDir, { recursive: true });

  const template = await loadNavigationTemplate('project-detail');
  let dateEntries = '';

  try {
    const dirs = await fs.readdir(projectDir, { withFileTypes: true });
    const dates = dirs
      .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
      .map(d => d.name)
      .sort()
      .reverse(); // Most recent first

    for (const date of dates) {
      const datePath = path.join(projectDir, date);
      const hasReport = existsSync(path.join(datePath, DEFAULT_INDEX_FILE));

      if (hasReport) {
        const formattedDate = new Date(date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        dateEntries += `
        <a href="./${date}/${DEFAULT_INDEX_FILE}" class="block p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
        <div class="flex items-center justify-between">
            <div>
              <h4 class="font-semibold text-gray-800 dark:text-white">${formattedDate}</h4>
              <p class="text-sm text-gray-600 dark:text-gray-400">${date}</p>
            </div>
            <i class="fas fa-chevron-right text-gray-400"></i>
          </div>
        </a>`;
      }
    }
  } catch {
    // Error reading project directory
  }

  // Handle empty state
  let emptyState = DEFAULT_EMPTY_STATE;
  if (!dateEntries) {
    emptyState = `
    <div class="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-6 text-center">
      <i class="fas fa-exclamation-triangle text-4xl text-yellow-500 mb-3"></i>
      <p class="text-gray-700 dark:text-gray-300">No reports found for this project</p>
      <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">Run <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">aicw report ${projectName}</code> to generate a report</p>
    </div>`;
  }


  let html = await replaceMacrosInTemplate(template, {
    "{{PROJECT_NAME}}": getProjectNameFromProjectFolder(projectName),
    "{{DATE_ENTRIES}}": dateEntries,
    "{{EMPTY_STATE}}": emptyState
  });    

  const outputPath = path.join(projectDir, 'index.html');
  await writeFileAtomic(outputPath, html);
}

/**
 * Generate static navigation for all projects or specific ones
 * @param specificProjects - Optional array of project names to regenerate
 */
export async function generateStaticNavigation(specificProjects?: string[]): Promise<void> {
  const outputDir = path.join(USER_REPORTS_DIR);

  // Create output directory if it doesn't exist
  await fs.mkdir(outputDir, { recursive: true });

  // Check if regeneration is needed (but always regenerate if no index.html exists)
  const indexExists = existsSync(path.join(outputDir, 'index.html'));
  const shouldRegenerate = !indexExists || await needsRegeneration(outputDir, specificProjects);

  if (!shouldRegenerate && !specificProjects) {
    logger.info('Navigation is up to date, skipping regeneration');
    return;
  }

  logger.info('Generating static navigation pages...');

  // Generate home page with projects directly
  await generateHomePageWithProjects(outputDir);

  const projectsDir = path.join(outputDir, 'projects');


  if (existsSync(projectsDir)) {
    const dirs = await fs.readdir(projectsDir, { withFileTypes: true });
    const projects = dirs.filter(d => d.isDirectory()).map(d => d.name);

    // Filter to specific projects if requested
    const projectsToGenerate = specificProjects
      ? projects.filter(p => specificProjects.includes(p))
      : projects;

    for (const project of projectsToGenerate) {
      await generateProjectDetail(outputDir, project);
    }
  }

  // Update metadata
  await updateMetadata(outputDir);

  logger.info('Navigation generation complete');
}

/**
 * Regenerate navigation for a specific project (called after report generation)
 */
export async function generateProjectNavigation(projectName: string): Promise<void> {
  const outputDir = path.join(USER_REPORTS_DIR, '');

  // Regenerate home page (to update last modified date and project list)
  await generateHomePageWithProjects(outputDir);

  // Regenerate specific project detail page
  await generateProjectDetail(outputDir, projectName);

  // Update metadata for this project
  const metaPath = path.join(outputDir, NAV_META_FILE);
  if (existsSync(metaPath)) {
    try {
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const metadata: NavigationMetadata = JSON.parse(metaContent);

      const projectDir = path.join(outputDir, 'projects', projectName);
      metadata.projectTimestamps[projectName] = await getDirectoryMTime(projectDir);
      metadata.lastGenerated = new Date().toISOString();

      await writeFileAtomic(metaPath, JSON.stringify(metadata, null, 2));
    } catch {
      // If error, regenerate full metadata
      await updateMetadata(outputDir);
    }
  } else {
    await updateMetadata(outputDir);
  }
}

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateStaticNavigation().catch(logger.error);
}