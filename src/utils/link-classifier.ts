/**
 * Link Classifier Utilities
 *
 * This module provides utilities for classifying links/URLs into categories
 * based on deterministic pattern matching. It's used by various enrichment
 * and extraction modules throughout the pipeline.
 */

import { loadLinkTypes, classifyPattern, type LinkTypeConfig } from '../config/link-types-loader.js';
import { DEFAULT_OTHER_LINK_TYPE_SHORT_NAME } from '../config/user-paths.js';
import { logger } from '../utils/compact-logger.js';



// Type definitions for the pattern structure
interface LinkPatterns {
  contains: string[];
  endsWith: string[];
  regex: string[];
}

interface LinkTypeConfigInternal {
  name: string;
  description?: string;
  patterns: LinkPatterns;
}

interface LinkClassificationData {
  linkTypes: { [code: string]: LinkTypeConfigInternal };
  processingOrder: string[];
}

// Cache for compiled regex patterns
export class LinkClassifier {
  private data: LinkClassificationData;
  private compiledRegexCache: Map<string, RegExp[]> = new Map();
  private linkTypeNames: { [code: string]: string } = {};

  constructor(data?: LinkClassificationData) {
    this.data = data || this.buildDataFromLoader();
    this.initializelinkTypeNames();
    this.compileRegexPatterns();
  }

  /**
   * Build LinkClassificationData from the new loader format
   */
  private buildDataFromLoader(): LinkClassificationData {
    const linkTypes = loadLinkTypes();
    const data: LinkClassificationData = {
      linkTypes: {},
      processingOrder: []
    };

    // Transform simplified format to internal format
    for (const linkType of linkTypes) {
      const patterns: LinkPatterns = {
        contains: [],
        endsWith: [],
        regex: []
      };

      // Classify each pattern
      for (const pattern of linkType.patterns) {
        const type = classifyPattern(pattern);

        if (type === 'regex') {
          // Remove regex delimiters if present
          const regexPattern = pattern.startsWith('/') && pattern.endsWith('/')
            ? pattern.slice(1, -1)
            : pattern;
          patterns.regex.push(regexPattern);
        } else if (type === 'endsWith') {
          // Remove leading * or . for endsWith patterns
          const endsWithPattern = pattern.startsWith('*')
            ? pattern.slice(1)
            : pattern;
          patterns.endsWith.push(endsWithPattern);
        } else {
          patterns.contains.push(pattern);
        }
      }

      data.linkTypes[linkType.code] = {
        name: linkType.name,
        description: linkType.description,
        patterns
      };
      data.processingOrder.push(linkType.code);
    }

    return data;
  }

  /**
   * Initialize the link type names mapping from the loaded data
   */
  private initializelinkTypeNames(): void {
    for (const [code, config] of Object.entries(this.data.linkTypes)) {
      this.linkTypeNames[code] = config.name;
    }
  }

  /**
   * Pre-compile all regex patterns for better performance
   */
  private compileRegexPatterns(): void {
    for (const [code, config] of Object.entries(this.data.linkTypes)) {
      if (config.patterns.regex && config.patterns.regex.length > 0) {
        const compiledPatterns = config.patterns.regex.map(
          pattern => new RegExp(pattern, 'i')
        );
        this.compiledRegexCache.set(code, compiledPatterns);
      }
    }
  }

  /**
   * Extract hostname from a URL or domain-like string.
   * - Returns lowercase hostname without 'www.'
   * - Falls back to best-effort parsing for bare domains with paths
   * Made public static so it can be reused for consistent URL normalization
   */
  static extractHostname(input: string): string {
    const str = (input || '').trim();
    if (!str) return '';

    // Try URL parsing when protocol is present
    try {
      if (/^[a-z]+:\/\//i.test(str)) {
        const u = new URL(str);
        return (u.hostname || '').toLowerCase().replace(/^www\./, '');
      }
    } catch {
      // ignore and fall back to manual parsing
    }

    // Manual parsing for domain-like inputs (possibly with path/query)
    // 1) strip protocol-like prefix if present without slashes
    let s = str.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    // 2) take up to first slash, hash, or question mark
    s = s.split(/[\/#?]/, 1)[0];
    return s.toLowerCase();
  }

  // Private instance method that delegates to static method for backward compatibility
  private extractHostname(input: string): string {
    return LinkClassifier.extractHostname(input);
  }

  /**
   * Get all link type names
   */
  getlinkTypeNames(): { [code: string]: string } {
    return { ...this.linkTypeNames };
  }

  /**
   * Classify a link based on its domain using the loaded patterns
   */
  classifyLinkType(domain: string): string {
    const full = (domain || '').toLowerCase();
    const host = this.extractHostname(domain);

    const shouldUseFullMatch = (pattern: string) => /[\/?#=]/.test(pattern);

    // Process link types in the specified order for priority
    for (const typeCode of this.data.processingOrder) {
      const config = this.data.linkTypes[typeCode];
      if (!config) continue;

      // Check contains patterns (fastest)
      if (config.patterns.contains?.length > 0) {
        for (const pattern of config.patterns.contains) {
          const normalizedPattern = pattern.toLowerCase();

          if (shouldUseFullMatch(pattern)) {
            // allow patterns with path fragments (e.g., spotify.com/show)
            if (full.includes(normalizedPattern)) {
              return typeCode;
            }
          } else if (host && host.includes(normalizedPattern)) {
            return typeCode;
          }
        }
      }

      // Check endsWith patterns
      if (config.patterns.endsWith?.length > 0) {
        for (const pattern of config.patterns.endsWith) {
          // endsWith should apply to hostname (e.g., .shop, .blog)
          if (host.endsWith(pattern)) {
            return typeCode;
          }
        }
      }

      // Check regex patterns (slowest, so we do it last)
      const compiledRegexes = this.compiledRegexCache.get(typeCode);
      if (compiledRegexes && compiledRegexes.length > 0) {
        for (const regex of compiledRegexes) {
          // regex should apply to hostname to avoid path false positives
          if (regex.test(host)) {
            return typeCode;
          }
        }
      }
    }

    // Default to 'oth' (DEFAULT_OTHER_LINK_TYPE_SHORT_NAME) if no patterns match
    return DEFAULT_OTHER_LINK_TYPE_SHORT_NAME;
  }

  /**
   * Batch classify multiple domains for better performance
   */
  classifyMultiple(domains: string[]): Map<string, string> {
    const results = new Map<string, string>();
    for (const domain of domains) {
      results.set(domain, this.classifyLinkType(domain));
    }
    return results;
  }

  /**
   * Get human-readable name for a link type code
   */
  getLinkTypeName(code: string): string {
    return this.linkTypeNames[code] || 'Unknown';
  }

  /**
   * Add or update patterns for a specific link type
   */
  updateLinkTypePatterns(code: string, patterns: Partial<LinkPatterns>): void {
    if (!this.data.linkTypes[code]) {
      throw new Error(`Link type '${code}' does not exist`);
    }

    const currentPatterns = this.data.linkTypes[code].patterns;

    if (patterns.contains) {
      currentPatterns.contains = patterns.contains;
    }
    if (patterns.endsWith) {
      currentPatterns.endsWith = patterns.endsWith;
    }
    if (patterns.regex) {
      currentPatterns.regex = patterns.regex;
      // Recompile regex patterns for this type
      const compiledPatterns = patterns.regex.map(
        pattern => new RegExp(pattern, 'i')
      );
      this.compiledRegexCache.set(code, compiledPatterns);
    }
  }

  /**
   * Get statistics about domain classification
   */
  getClassificationStats(domains: string[]): { [code: string]: number } {
    const stats: { [code: string]: number } = {};

    for (const domain of domains) {
      const type = this.classifyLinkType(domain);
      stats[type] = (stats[type] || 0) + 1;
    }

    return stats;
  }
}

// Export singleton instance for convenience
const classifier = new LinkClassifier();

// Export both the class and convenience functions
export { classifier };

// Convenience exports that use the singleton
export const LINK_TYPE_NAMES = classifier.getlinkTypeNames();
export const classifyLinkType = (domain: string) => classifier.classifyLinkType(domain);
export const getLinkTypeName = (code: string) => classifier.getLinkTypeName(code);
export const extractHostname = (input: string) => LinkClassifier.extractHostname(input);