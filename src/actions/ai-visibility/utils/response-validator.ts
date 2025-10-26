/**
 * Response Validator
 *
 * Shared utility for validating HTML responses to ensure they are valid pages
 * and not error pages, captchas, or rate limit responses.
 */

// Minimum size for valid HTML content (500 bytes to avoid error pages)
export const MIN_VALID_HTML_SIZE = 500;

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  size: number;
}

/**
 * Common error patterns found in error pages, captchas, and rate limit responses
 */
const ERROR_PATTERNS = [
  // Rate limiting
  /too many requests/i,
  /rate limit/i,
  /try again later/i,

  // Captcha
  /captcha/i,
  /recaptcha/i,
  /verify you(?:'re| are) (not )?a (robot|human)/i,

  // Access denied / Blocked
  /access denied/i,
  /403 forbidden/i,
  /you don't have permission/i,
  /blocked/i,

  // Bot detection
  /unusual traffic/i,
  /automated requests/i,
  /suspicious activity/i,
];

/**
 * Validate HTML response to check if it's a real page or an error
 *
 * @param html - HTML content to validate
 * @param headers - Optional Response headers
 * @returns Validation result with isValid flag and optional reason
 */
export function validateHtmlResponse(html: string, headers?: Headers): ValidationResult {
  const size = html.length;

  // Check 1: Minimum size
  if (size < MIN_VALID_HTML_SIZE) {
    return {
      isValid: false,
      reason: `Content too small (${size} bytes, minimum ${MIN_VALID_HTML_SIZE})`,
      size
    };
  }

  // Check 2: Content-Type header (if provided)
  if (headers) {
    const contentType = headers.get('content-type');
    if (contentType && !contentType.includes('text/html')) {
      return {
        isValid: false,
        reason: `Invalid content type: ${contentType}`,
        size
      };
    }

    // Check X-Robots-Tag header for noindex
    const robotsTag = headers.get('x-robots-tag');
    if (robotsTag && /noindex/i.test(robotsTag)) {
      return {
        isValid: false,
        reason: 'X-Robots-Tag: noindex header present',
        size
      };
    }
  }

  // Check 3: Common error patterns
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(html)) {
      return {
        isValid: false,
        reason: `Error page detected (matched: ${pattern.source})`,
        size
      };
    }
  }

  // Passed all checks
  return {
    isValid: true,
    size
  };
}
