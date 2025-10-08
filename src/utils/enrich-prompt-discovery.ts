/**
 * Prompt Discovery Utilities
 *
 * Discovers which enrichment attributes are available for each section
 * by scanning the filesystem for prompt template files.
 *
 * The presence of a prompt file determines whether that enrichment is performed.
 * For example:
 * - prompts/enrich/keywords/similar.md exists → keywords get similar enrichment
 * - prompts/enrich/keywords/link.md missing → keywords don't get link enrichment
 */

import { existsSync, promises as fs } from 'fs';
import path from 'path';
import { logger } from './compact-logger.js';
import { PROMPTS_DIR } from '../config/paths.js';
import { PipelineCriticalError } from './pipeline-errors.js';

const ENRICH_PROMPTS_DIR = path.join(PROMPTS_DIR, 'enrich');

/**
 * Check if a directory exists
 */
async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Discover which attributes can be enriched for a specific section
 * by checking which prompt files exist.
 *
 * @param section - The section name (e.g., 'keywords', 'places', 'products')
 * @param attributeFilter - Optional filter to check for a specific attribute only
 * @returns Array of attribute names that can be enriched (e.g., ['link', 'similar'])
 */
export async function checkIfPromptExistsForEnrichingAttribute(
  section: string,
  attributeFilter?: string
): Promise<string[]> {
  const sectionDir = path.join(ENRICH_PROMPTS_DIR, section);
  const attrs = new Set<string>();

  // Check section-specific prompts first
  if (await dirExists(sectionDir)) {
    try {
      const files = await fs.readdir(sectionDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const attr = file.replace('.md', '');
          // Apply filter if provided
          if (!attributeFilter || attr === attributeFilter) {
            attrs.add(attr);
            logger.debug(`Found section-specific prompt: ${section}/${attr}`);
          }
        }
      }
    } catch (error) {
      logger.debug(`Could not read section directory ${sectionDir}: ${error}`);
      throw new PipelineCriticalError(
        `Could not read section directory ${sectionDir}: ${error}`,
        'enrich-prompt-discovery',
        section
      )
    }
  }
  else {
   throw new PipelineCriticalError(
    `Section directory ${sectionDir} does not exist`,
    'enrich-prompt-discovery',
    section
   );
  }

  return Array.from(attrs);
}

/**
 * Get the prompt file path for a specific section and attribute.
 * Returns section-specific prompt if it exists, otherwise falls back to default.
 * Returns null if no prompt file exists.
 *
 * @param section - The section name (e.g., 'keywords', 'places')
 * @param attribute - The attribute name (e.g., 'link', 'similar')
 * @returns Full path to the prompt file, or null if not found
 */
export function getEnrichmentPromptPath(section: string, attribute: string): string | null {
  const specific = path.join(ENRICH_PROMPTS_DIR, section, `${attribute}.md`);

  if (fileExists(specific)) {
    logger.debug(`Using section-specific prompt: ${section}/${attribute}.md`);
    return specific;
  }

  throw new PipelineCriticalError(
    `No prompt found for ${section}.${attribute} at "${specific}"`,
    'enrich-prompt-discovery',
    section
  );
}

/**
 * Get all sections that have at least one enrichment prompt configured.
 *
 * @param attributeFilter - Optional filter to only check for sections with a specific attribute
 * @returns Array of section names that can be enriched
 */
export async function getEnrichableSections(attributeFilter?: string): Promise<string[]> {
  const sections: string[] = [];

  try {
    const entries = await fs.readdir(ENRICH_PROMPTS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      // Skip _default directory
      if (entry.name === '_default' || !entry.isDirectory()) {
        continue;
      }

      // Check if this section has any enrichable attributes
      const attrs = await checkIfPromptExistsForEnrichingAttribute(entry.name, attributeFilter);
      if (attrs.length > 0) {
        sections.push(entry.name);
      }
    }
  } catch (error) {
    logger.error(`Could not read enrich directory: ${error}`);
  }

  return sections;
}

/**
 * Check if a specific section+attribute combination has a prompt configured.
 *
 * @param section - The section name
 * @param attribute - The attribute name
 * @returns true if a prompt exists (either section-specific or default)
 */
export function hasEnrichmentPrompt(section: string, attribute: string): boolean {
  return getEnrichmentPromptPath(section, attribute) !== null;
}
