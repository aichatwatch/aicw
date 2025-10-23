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
}

/**
 * Simple delay utility
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
  // Network errors are retryable
  if (error?.name === 'AbortError' || error?.code === 'ECONNRESET') {
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
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);
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
