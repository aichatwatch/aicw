import { promises as fs } from 'fs';
import path from 'path';
import { USER_CACHE_DIR } from '../config/user-paths.js';
import { logger } from  './compact-logger.js';
import { writeFileAtomic } from './misc-utils.js';

/**
 * Logger interface for optional external logging
 */
export interface ISimpleCacheLogger {
  debug: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * Configuration options for SimpleCache
 */
export interface SimpleCacheOptions {
  /** Name of the cache (used for file naming) */
  cacheName: string;
  /** Directory to store cache files (defaults to system cache dir) */
  cacheDir?: string;
  /** Maximum age of cache entries in seconds (optional TTL) */
  maxAgeSeconds?: number;
  /** Optional logger for debug/warn/error messages */
  logger?: ISimpleCacheLogger;
}

interface CacheEntry {
  value: string;
  timestamp: number; // milliseconds since epoch
}

/**
 * Simple key-value cache with file persistence and optional TTL support
 * Can be used for any caching needs in the application
 *
 * @example
 * // Basic usage (backward compatible)
 * const cache = new SimpleCache('my-cache');
 *
 * @example
 * // With custom directory and TTL
 * const cache = new SimpleCache({
 *   cacheName: 'my-cache',
 *   cacheDir: './data/cache',
 *   maxAgeSeconds: 3600
 * });
 *
 * @example
 * // With custom logger
 * const cache = new SimpleCache({
 *   cacheName: 'my-cache',
 *   logger: myCustomLogger
 * });
 */
export class SimpleCache {
  private cache: Map<string, CacheEntry>;
  private cachePath: string;
  private cacheName: string;
  private cacheDir: string;
  private isDirty: boolean = false;
  private maxAgeSeconds?: number;
  private logger?: ISimpleCacheLogger;

  /**
   * Create a new SimpleCache instance
   * @param options - Cache configuration (or cacheName string for backward compatibility)
   * @param maxAgeSeconds - Optional TTL in seconds (only used with legacy string constructor)
   */
  constructor(options: SimpleCacheOptions | string, maxAgeSeconds?: number) {
    // Support backward compatible constructor: new SimpleCache('name', ttl)
    if (typeof options === 'string') {
      this.cacheName = options;
      this.cacheDir = USER_CACHE_DIR;
      this.maxAgeSeconds = maxAgeSeconds;
      this.logger = logger; // Use default logger for backward compat
    } else {
      this.cacheName = options.cacheName;
      this.cacheDir = options.cacheDir || USER_CACHE_DIR;
      this.maxAgeSeconds = options.maxAgeSeconds;
      this.logger = options.logger;
    }

    this.cachePath = path.join(this.cacheDir, `${this.cacheName}.txt`);
    this.cache = new Map();
  }

  /**
   * Load cache from disk
   * Automatically creates the cache directory if it doesn't exist.
   * Skips expired entries based on maxAgeSeconds.
   * Backward compatible with old cache format (without timestamps).
   */
  async load(): Promise<void> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Try to read cache file
      const content = await fs.readFile(this.cachePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      let validEntries = 0;
      let invalidEntries = 0;

      for (const line of lines) {
        const firstSep = line.indexOf('>');
        if (firstSep > 0) {
          const key = line.substring(0, firstSep).trim();
          const rest = line.substring(firstSep + 1);

          // Try to parse new format: key>timestamp>value
          const secondSep = rest.indexOf('>');
          let timestamp: number;
          let value: string;

          if (secondSep > 0) {
            // New format with timestamp
            timestamp = parseInt(rest.substring(0, secondSep).trim());
            value = rest.substring(secondSep + 1).trim();
          } else {
            // Old format without timestamp - treat as very old
            timestamp = 0;
            value = rest.trim();
          }

          if (key && value) {
            // Check if expired
            if (this.maxAgeSeconds !== undefined && timestamp > 0) {
              const ageSeconds = (Date.now() - timestamp) / 1000;
              if (ageSeconds > this.maxAgeSeconds) {
                invalidEntries++;
                continue; // Skip expired entry
              }
            }

            this.cache.set(key, { value, timestamp });
            validEntries++;
          } else {
            invalidEntries++;
          }
        } else {
          invalidEntries++;
        }
      }

      if (validEntries > 0) {
        this.logger?.debug(`Loaded ${validEntries} entries from ${this.cacheName} cache`);
      }
      if (invalidEntries > 0) {
        this.logger?.warn(`Skipped ${invalidEntries} invalid entries in ${this.cacheName} cache`);
      }

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger?.debug(`No existing ${this.cacheName} cache found, starting fresh`);
      } else {
        this.logger?.warn(`Failed to load ${this.cacheName} cache: ${error.message}`);
      }
      // Start with empty cache on any error
      this.cache.clear();
    }
  }

  /**
   * Save cache to disk (only if dirty)
   * Uses atomic write to prevent corruption.
   * Only writes if the cache has been modified (dirty flag optimization).
   * Automatically creates the cache directory if it doesn't exist.
   */
  async save(): Promise<void> {
    if (!this.isDirty) {
      return; // Nothing to save
    }

    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Build cache content
      const lines: string[] = [];
      for (const [key, entry] of this.cache.entries()) {
        // Sanitize to prevent injection of separator
        const safeKey = key.replace(/>/g, '');
        const safeValue = entry.value.replace(/>/g, '');
        lines.push(`${safeKey}>${entry.timestamp}>${safeValue}`);
      }

      // Write to file
      await writeFileAtomic(this.cachePath, lines.join('\n'), { encoding: 'utf-8' });
      this.isDirty = false;

      this.logger?.debug(`Saved ${this.cache.size} entries to ${this.cacheName} cache`);

    } catch (error: any) {
      this.logger?.error(`Failed to save ${this.cacheName} cache: ${error.message}`);
      // Don't throw - caching should not break the main flow
    }
  }

  /**
   * Get value from cache
   * Automatically checks expiration and removes expired entries.
   * @param key - Cache key
   * @returns Cached value or undefined if not found or expired
   */
  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check expiration
    if (this.maxAgeSeconds !== undefined && entry.timestamp > 0) {
      const ageSeconds = (Date.now() - entry.timestamp) / 1000;
      if (ageSeconds > this.maxAgeSeconds) {
        this.cache.delete(key);
        this.isDirty = true;
        return undefined;
      }
    }

    return entry.value;
  }

  /**
   * Set value in cache
   * Marks cache as dirty if the value is new or changed.
   * Automatically sets timestamp for TTL tracking.
   * @param key - Cache key
   * @param value - Value to cache (must be a string)
   */
  set(key: string, value: string): void {
    const newEntry = { value, timestamp: Date.now() };
    const existing = this.cache.get(key);

    // Only mark dirty if value actually changed
    if (!existing || existing.value !== value) {
      this.cache.set(key, newEntry);
      this.isDirty = true;
    }
  }

  /**
   * Check if key exists in cache
   * Respects TTL - returns false for expired entries.
   * @param key - Cache key to check
   * @returns true if key exists and is not expired, false otherwise
   */
  has(key: string): boolean {
    // Use get() to check expiration
    return this.get(key) !== undefined;
  }

  /**
   * Delete a key from cache
   * Marks cache as dirty for persistence.
   * @param key - Cache key to delete
   * @returns true if key was deleted, false if key didn't exist
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    if (result) {
      this.isDirty = true;
    }
    return result;
  }

  /**
   * Clear all cache entries
   * Marks cache as dirty for persistence.
   */
  clear(): void {
    if (this.cache.size > 0) {
      this.cache.clear();
      this.isDirty = true;
    }
  }

  /**
   * Get number of cached entries
   * @returns Number of entries currently in cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in cache
   * @returns Array of all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all entries as array of [key, value] pairs
   * @returns Array of [key, value] tuples
   */
  entries(): Array<[string, string]> {
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Get cache statistics
   * @returns Object containing cache size, file path, and dirty flag
   */
  getStats(): { size: number; path: string; isDirty: boolean } {
    return {
      size: this.cache.size,
      path: this.cachePath,
      isDirty: this.isDirty
    };
  }
}