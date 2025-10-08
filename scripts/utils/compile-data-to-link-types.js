#!/usr/bin/env node

/**
 * Core compilation functions for link type patterns
 * Shared module used by both OSS and EE build scripts
 */

import fs from 'fs';
import path from 'path';

/**
 * Parse a pattern file and extract metadata and patterns
 * @param {string} filePath - Path to the pattern file
 * @returns {object|null} Parsed pattern object or null if file doesn't exist
 */
export function parsePatternFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Extract metadata from first 3 lines
  const name = lines[0]?.trim() || '';
  const orderLine = lines[1]?.trim() || '';
  const descLine = lines[2]?.trim() || '';

  // Parse order (format: "order: 5")
  const orderMatch = orderLine.match(/order:\s*(\d+)/);
  const order = orderMatch ? parseInt(orderMatch[1], 10) : 999;

  // Parse description (format: "description:Some description text")
  const description = descLine.startsWith('description:')
    ? descLine.slice('description:'.length).trim()
    : descLine;

  // Extract patterns (lines 4+, skip empty lines and comments)
  const patterns = [];
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('#')) {
      patterns.push(line);
    }
  }

  // Get code from filename
  const code = path.basename(filePath, '.txt');

  return {
    code,
    name,
    description,
    patterns,
    order
  };
}

/**
 * Load all patterns from a directory
 * @param {string} dir - Directory containing pattern files
 * @returns {array} Array of parsed pattern objects
 */
export function loadPatternsFromDirectory(dir) {
  const patterns = [];

  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return patterns;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));

  for (const file of files) {
    const filePath = path.join(dir, file);
    const parsed = parsePatternFile(filePath);
    if (parsed && parsed.patterns.length > 0) {
      patterns.push(parsed);
    }
  }

  return patterns;
}

/**
 * Merge EE patterns with base patterns
 * EE patterns override base patterns with same code
 * @param {array} basePatterns - Base pattern objects
 * @param {array} eePatterns - EE pattern objects
 * @returns {array} Merged pattern objects
 */
export function mergePatterns(basePatterns, eePatterns) {
  const merged = [...basePatterns];

  for (const eePattern of eePatterns) {
    const existingIndex = merged.findIndex(p => p.code === eePattern.code);
    if (existingIndex >= 0) {
      // Replace existing pattern with EE version
      merged[existingIndex] = eePattern;
    } else {
      // Add new EE-only pattern
      merged.push(eePattern);
    }
  }

  return merged;
}

/**
 * Sort patterns by order, then by code
 * @param {array} patterns - Pattern objects to sort
 * @returns {array} Sorted pattern objects
 */
export function sortPatterns(patterns) {
  return patterns.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.code.localeCompare(b.code);
  });
}

/**
 * Clean up pattern objects for JSON output (remove order field)
 * @param {array} patterns - Pattern objects to clean
 * @returns {array} Cleaned pattern objects
 */
export function cleanPatterns(patterns) {
  return patterns.map(({ code, name, description, patterns }) => ({
    code,
    name,
    description,
    patterns
  }));
}

/**
 * Compile link types from pattern directory to JSON output
 * @param {string} patternsDir - Pattern directory to process
 * @param {string} outputPath - Path to write the JSON output
 * @param {boolean} updateExisting - If true, merge with existing file; if false, overwrite (default: false)
 * @returns {object} Compilation result with statistics
 */
export function compileDataToLinkTypes(patternsDir, outputPath, updateExisting = false) {
  console.log(`📂 Loading patterns from ${patternsDir}...`);
  const newPatterns = loadPatternsFromDirectory(patternsDir);
  console.log(`   Found ${newPatterns.length} pattern files`);

  let existingPatterns = [];

  // If updateExisting, load existing patterns from output file
  if (updateExisting && fs.existsSync(outputPath)) {
    console.log(`📄 Loading existing patterns from ${outputPath}...`);
    const existingData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    // Convert back to internal format with order
    existingPatterns = existingData.map((p, index) => ({
      ...p,
      order: index // Preserve existing order
    }));
    console.log(`   Found ${existingPatterns.length} existing categories`);
  }

  // Merge patterns (new patterns override existing ones with same code)
  const mergedPatterns = updateExisting
    ? mergePatterns(existingPatterns, newPatterns)
    : newPatterns;

  // Sort and clean patterns
  const sortedPatterns = sortPatterns(mergedPatterns);
  const cleanedPatterns = cleanPatterns(sortedPatterns);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write JSON output
  fs.writeFileSync(outputPath, JSON.stringify(cleanedPatterns, null, 2));

  const action = updateExisting ? 'Updated' : 'Generated';
  console.log(`✅ ${action}: ${outputPath}`);
  console.log(`📊 Total categories: ${cleanedPatterns.length}`);

  if (updateExisting && existingPatterns.length > 0) {
    const newCount = cleanedPatterns.length - existingPatterns.length;
    if (newCount > 0) {
      console.log(`   Added ${newCount} new categories`);
    }
  }

  return {
    totalCategories: cleanedPatterns.length,
    patterns: cleanedPatterns
  };
}