#!/usr/bin/env node

/**
 * Build script to compile OSS link type patterns from txt files into JSON
 * This script processes only the base (non-EE) patterns
 * Generates: src/config/link-types.json
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { compileDataToLinkTypes } from './utils/compile-data-to-link-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Paths
const basePatternsDir = path.join(projectRoot, 'src', 'data', 'link-types', 'patterns');
const baseOutputPath = path.join(projectRoot, 'src', 'config', 'link-types.json');

/**
 * Main build function for OSS version
 */
function buildLinkTypes() {
  console.log('🔨 Building OSS link-types.json file...\n');

  try {
    // Compile patterns from base directory only (overwrite mode)
    const result = compileDataToLinkTypes(basePatternsDir, baseOutputPath, false);

    // Show summary
    console.log('\n✨ Link types build complete!');
    console.log(`   Total link types: ${result.totalCategories}`);
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run the build
buildLinkTypes();