/**
 * HTTP caller with simple retry logic and custom User-Agent support
 *
 * Lightweight wrapper around native fetch() with configurable User-Agent.
 * Includes basic retry for network errors.
 */

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;

export interface HttpCallOptions {
  /** Custom User-Agent string (defaults to browser UA) */
  userAgent?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Context info for logging */
  contextInfo?: string;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
}

/**
 * Simple delay utility
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 * Consolidates patterns from ai-caller.ts and error-handler.ts
 */
function isRetryableError(error: any): boolean {
  // Timeout errors
  if (error?.name === 'AbortError') {
    return true;
  }

  // Network error codes (check both direct and wrapped - Node.js fetch wraps errors)
  const errorCode = error?.code || error?.cause?.code;
  const retryableCodes = [
    'ENOTFOUND',      // DNS lookup failed
    'ECONNREFUSED',   // Connection refused
    'ECONNRESET',     // Connection reset
    'ETIMEDOUT',      // Connection timeout
    'ESOCKETTIMEDOUT' // Socket timeout
  ];

  if (errorCode && retryableCodes.includes(errorCode)) {
    return true;
  }

  // Generic fetch failure - common with Node.js fetch
  if (error?.message?.includes('fetch failed')) {
    return true;
  }

  return false;
}

/**
 * Call HTTP endpoint with optional retry
 *
 * @param url - URL to fetch
 * @param options - Request and retry options
 * @returns Response object
 */
export async function callHttpWithRetry(
  url: string,
  options?: HttpCallOptions
): Promise<Response> {
  const userAgent = options?.userAgent || DEFAULT_USER_AGENT;
  const timeout = options?.timeout || DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': userAgent,
            'Connection': 'keep-alive',
            ...options.headers || {}
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Retry on 5xx server errors (transient issues) - pattern from ai-caller.ts
        if (response.status >= 500 && response.status < 600 && attempt < maxRetries) {
          await delay(DEFAULT_RETRY_DELAY_MS * (attempt + 1));
          continue;
        }

        return response;

      } catch (error: any) {
        clearTimeout(timeoutId);
        throw error;
      }

    } catch (error: any) {
      lastError = error;

      // Don't retry if we're out of attempts
      if (attempt === maxRetries) {
        break;
      }

      // Only retry on network errors
      if (isRetryableError(error)) {
        await delay(DEFAULT_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      // Non-retryable error, throw immediately
      throw error;
    }
  }

  // If we get here, we've exhausted retries
  throw lastError;
}
