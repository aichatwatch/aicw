  /**
   * Link Types Loader
   */

// import link types from link-types.json which is automatically generated
// from /config/data/link-types/patterns during prebuild using scripts/build-link-types.js
import linkTypesData from './data-generated/link-types.json' with { type: 'json' };

// Type definitions
export interface LinkTypeConfig {
  code: string;
  name: string;
  description: string;
  patterns: string[];
}

/**
 * Load link types
 */
export function loadLinkTypes(): LinkTypeConfig[] {
  return linkTypesData;
}

/**
 * Get link types as a map for faster lookup
 */
export function getLinkTypesMap(): Map<string, LinkTypeConfig> {
  const linkTypes = loadLinkTypes();
  const map = new Map<string, LinkTypeConfig>();

  for (const linkType of linkTypes) {
    map.set(linkType.code, linkType);
  }

  return map;
}

/**
 * Get all link type codes
 */
export function getLinkTypeCodes(): string[] {
  return loadLinkTypes().map(lt => lt.code);
}

/**
 * Get link type by code
 */
export function getLinkTypeByCode(code: string): LinkTypeConfig | undefined {
  const linkTypes = loadLinkTypes();
  return linkTypes.find(lt => lt.code === code);
}

/**
 * Check if a pattern should be treated as regex
 */
export function isRegexPattern(pattern: string): boolean {
  // Common regex special characters
  return /[\[\]\(\)\{\}\+\?\|\\^$]/.test(pattern) || pattern.includes('.*');
}

/**
 * Check if a pattern should be treated as endsWith
 */
export function isEndsWithPattern(pattern: string): boolean {
  // Patterns starting with * or . are typically endsWith patterns
  return pattern.startsWith('*') || pattern.startsWith('.');
}

/**
 * Classify a pattern into its type
 */
export function classifyPattern(pattern: string): 'regex' | 'endsWith' | 'contains' {
  if (isRegexPattern(pattern)) {
    return 'regex';
  }
  if (isEndsWithPattern(pattern)) {
    return 'endsWith';
  }
  return 'contains';
}