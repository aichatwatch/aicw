/**
 * JSON-LD Structure Check
 *
 * Checks for presence and validity of JSON-LD structured data on the page.
 * JSON-LD helps AI understand page content and structure.
 *
 * Note: This check requires pre-fetched HTML content (browserHtml parameter).
 * It does NOT fetch HTML itself to avoid duplicate requests.
 */

import { BaseVisibilityCheck, VisibilityCheckResult } from './base-visibility-check.js';

export class CheckJsonLD extends BaseVisibilityCheck {
  readonly name = 'JSON-LD Structure';

  protected async performCheck(url: string, browserHtml?: string): Promise<VisibilityCheckResult> {
    // Require HTML content - this check doesn't fetch
    if (!browserHtml) {
      throw new Error('HTML content is required for JSON-LD check');
    }

    // Find all JSON-LD script tags
    const jsonLdMatches = browserHtml.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );

    if (!jsonLdMatches || jsonLdMatches.length === 0) {
      return {
        score: 0,
        maxScore: this.maxScore,
        passed: false,
        details: 'No JSON-LD found'
      };
    }

    // Parse and validate JSON-LD
    const validSchemas: string[] = [];
    for (const match of jsonLdMatches) {
      const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '').trim();
      try {
        const data = JSON.parse(jsonContent);
        if (data['@type']) {
          const schemaType = Array.isArray(data['@type'])
            ? data['@type'].join(', ')
            : data['@type'];
          validSchemas.push(schemaType);
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }

    const score = validSchemas.length > 0 ? 10 : 5;

    return {
      score,
      maxScore: this.maxScore,
      passed: score === 10,
      details: validSchemas.length > 0
        ? `Found: ${validSchemas.join(', ')}`
        : `Found ${jsonLdMatches.length} JSON-LD blocks but invalid`,
      metadata: {
        schemas: validSchemas,
        totalBlocks: jsonLdMatches.length,
        validBlocks: validSchemas.length
      }
    };
  }
}
