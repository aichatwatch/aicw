import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';
import { logger } from '../../../utils/compact-logger.js';

// general regex to run JSON LD regex
const JSON_LD_REGEX = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

// High-value schemas that AI systems heavily favor
const HIGH_VALUE_SCHEMAS = ['FAQPage', 'QAPage', 'Article', 'NewsArticle', 'BlogPosting', 'HowTo', 'Recipe'];


export class CheckContentJsonLD extends BaseVisibilityCheck {
  readonly name = 'Content: JSON-LD Structured Data Presence';

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    // Require HTML content - this check doesn't fetch
    const browserHtml = pageCaptured?.browserHtmlDesktop;
    if (!browserHtml) {
      throw new Error('HTML content is required for JSON-LD check');
    }

    // Find all JSON-LD script tags
    const jsonLdMatches = browserHtml.match(
      JSON_LD_REGEX
    );

    if (!jsonLdMatches || jsonLdMatches.length === 0) {
      return {
        score: 0,
        maxScore: this.maxScore,
        passed: false,
        details: 'No JSON-LD structured data found.'
      };
    }

    // Parse and validate JSON-LD
    const validSchemas: string[] = [];
    for (const match of jsonLdMatches) {
      const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '').trim();
      try {
        const data = JSON.parse(jsonContent);
        if (data['@type']) {
          if(Array.isArray(data['@type'])) {
            for(const type of data['@type']) {
              validSchemas.push(type);
              logger.debug(`found JSON-LD schema type: ${type}`);
            }
          } else {
            validSchemas.push(data['@type']);
            logger.debug(`found JSON-LD schema type: ${data['@type']}`);
          }
        }
      } catch (e) {
        logger.error(`Broken JSON-LD data block detected`);
      }
    }

    // Detect high-value schemas
    const highValueSchemasFound = validSchemas.filter(s => HIGH_VALUE_SCHEMAS.includes(s));
    const hasHighValueSchema = highValueSchemasFound.length > 0;

    // Score based on number of valid schemas found (capped at 3)
    // More schemas = better structured data for AI visibility
    const maxSchemasToScore = 3;
    const schemasFound = Math.min(validSchemas.length, maxSchemasToScore);
    let score = (schemasFound / maxSchemasToScore) * this.maxScore;

    // Bonus for high-value schemas (10% boost, capped at maxScore)
    if (hasHighValueSchema) {
      score = Math.min(score * 1.1, this.maxScore);
    }

    // Display count to show progress toward max score
    const schemasCount = validSchemas.length;
    const countDisplay = schemasCount < maxSchemasToScore
      ? `${schemasCount}/${maxSchemasToScore}`
      : `${schemasCount}`;

    return {
      score,
      maxScore: this.maxScore,
      passed: score === this.maxScore,
      details: validSchemas.length > 0
        ? `Found ${countDisplay} schemas: ${validSchemas.join(', ')}` +
          (hasHighValueSchema ? ` (includes high-value schemas: ${highValueSchemasFound.join(', ')})` : '')
        : `Found ${jsonLdMatches.length} JSON-LD blocks but invalid`,
      metadata: {
        schemas: validSchemas,
        highValueSchemas: highValueSchemasFound,
        totalBlocks: jsonLdMatches.length,
        validBlocks: validSchemas.length
      }
    };
  }
}
