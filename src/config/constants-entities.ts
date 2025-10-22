/**
 * Central configuration for data categories used throughout the application
 */

export const ENTITIES_CONFIG = [
  { name: "products", isComputed: false },
  { name: "organizations", isComputed: false },
  { name: "persons", isComputed: false },
  { name: "keywords", isComputed: false },
  { name: "places", isComputed: false },
  { name: "events", isComputed: false },
  { name: "links", isComputed: false },
  { name: "linkTypes", isComputed: true },
  { name: "linkDomains", isComputed: true },
]

// Main data categories that are tracked and analyzed
// MAIN_SECTIONS is basically the list of entities as stringsthat are tracked and analyzed
export const MAIN_SECTIONS = ENTITIES_CONFIG.map(entity => entity.name);

// MAIN_SECTIONS_WITH_COMPUTED_DATA is the list of entities as strings that have computed data 
// like linkTypes and linkDomains
export const MAIN_SECTIONS_WITH_COMPUTED_DATA = ENTITIES_CONFIG.filter(entity => entity.isComputed).map(entity => entity.name);

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