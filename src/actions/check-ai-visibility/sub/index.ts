/**
 * AI Visibility Checks Registry
 *
 * Central registry of all visibility checks.
 * Checks are executed in the order defined in VISIBILITY_CHECKS array.
 */

import { BaseVisibilityCheck } from './base-visibility-check.js';
import { CheckRobotsTxt } from './check-robots-txt.js';
import { CheckAIBotAccessibility } from './check-ai-bot-accessibility.js';
import { CheckMetaTags } from './check-meta-tags.js';
import { CheckJsonLD } from './check-json-ld.js';

/**
 * Ordered list of visibility checks to execute
 * Add new checks here to include them in the validation
 *
 * Note: CheckMetaTags and CheckJsonLD use pre-fetched HTML (browserHtml) to avoid duplicate requests.
 * The main action fetches HTML once with browser UA and passes it to all checks.
 */
export const VISIBILITY_CHECKS: (new () => BaseVisibilityCheck)[] = [
  CheckRobotsTxt,
  CheckAIBotAccessibility,
  CheckMetaTags,
  CheckJsonLD
];

/**
 * Get instantiated visibility checks in execution order
 */
export function getAllVisibilityChecks(): BaseVisibilityCheck[] {
  return VISIBILITY_CHECKS.map(CheckClass => new CheckClass());
}

// Export types and base class for extensibility
export { BaseVisibilityCheck, VisibilityCheckResult } from './base-visibility-check.js';
