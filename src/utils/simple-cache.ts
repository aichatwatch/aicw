import { promises as fs } from 'fs';
import path from 'path';
import { USER_CACHE_DIR } from '../config/user-paths.js';
import { logger } from  './compact-logger.js';
import { writeFileAtomic } from './misc-utils.js';

interface CacheEntry {
  value: string;
  timestamp: number; // milliseconds since epoch
}

/**
 * Simple key-value cache with file persistence and optional TTL support
 * Can be used for any caching needs in the application
 */
export class SimpleCache {
  private cache: Map<string, CacheEntry>;
  private cachePath: string;
  private cacheName: string;
  private isDirty: boolean = false;
  private maxAgeSeconds?: number;

  constructor(cacheName: string, maxAgeSeconds?: number) {
    this.cacheName = cacheName;
    this.cachePath = path.join(USER_CACHE_DIR, `${cacheName}.txt`);
    this.cache = new Map();
    this.maxAgeSeconds = maxAgeSeconds;
  }

  /**
   * Load cache from disk
   */
  async load(): Promise<void> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(USER_CACHE_DIR, { recursive: true });

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
        logger.debug(`Loaded ${validEntries} entries from ${this.cacheName} cache`);
      }
      if (invalidEntries > 0) {
        logger.warn(`Skipped ${invalidEntries} invalid entries in ${this.cacheName} cache`);
      }

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.debug(`No existing ${this.cacheName} cache found, starting fresh`);
      } else {
        logger.warn(`Failed to load ${this.cacheName} cache: ${error.message}`);
      }
      // Start with empty cache on any error
      this.cache.clear();
    }
  }

  /**
   * Save cache to disk (only if dirty)
   */
  async save(): Promise<void> {
    if (!this.isDirty) {
      return; // Nothing to save
    }

    try {
      // Ensure cache directory exists
      await fs.mkdir(USER_CACHE_DIR, { recursive: true });

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

      logger.debug(`Saved ${this.cache.size} entries to ${this.cacheName} cache`);

    } catch (error: any) {
      logger.error(`Failed to save ${this.cacheName} cache: ${error.message}`);
      // Don't throw - caching should not break the main flow
    }
  }

  /**
   * Get value from cache
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
   */
  has(key: string): boolean {
    // Use get() to check expiration
    return this.get(key) !== undefined;
  }

  /**
   * Delete a key from cache
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
   */
  clear(): void {
    if (this.cache.size > 0) {
      this.cache.clear();
      this.isDirty = true;
    }
  }

  /**
   * Get number of cached entries
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all entries as array of [key, value] pairs
   */
  entries(): Array<[string, string]> {
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; path: string; isDirty: boolean } {
    return {
      size: this.cache.size,
      path: this.cachePath,
      isDirty: this.isDirty
    };
  }
}