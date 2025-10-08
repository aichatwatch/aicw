/**
 * Central configuration for data categories used throughout the application
 */

// Main data categories that are tracked and analyzed
export const MAIN_SECTIONS = [
  'products',
  'organizations',
  'persons',
  'keywords',
  'places',
  'events',
  'links',
  'linkTypes'
] as const;

// All categories
export const ALL_CATEGORIES = [...MAIN_SECTIONS] as const;

// Type definitions
export type MainCategory = typeof MAIN_SECTIONS[number];
export type Category = typeof ALL_CATEGORIES[number];

// Helper functions
export function isMainCategory(category: string): category is MainCategory {
  return MAIN_SECTIONS.includes(category as MainCategory);
}

// Categories that should be included in itemsByType structures
export function getCategoriesForItemsByType(): string[] {
  // Include main categories plus 'organizations' alias for backward compatibility
  // Also include 'linkTypes' for aggregate report processing
  return [...MAIN_SECTIONS];
}