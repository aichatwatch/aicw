#!/usr/bin/env node

/**
 * Generates: src/config/link-types.json
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { compileDataToLinkTypes } from './utils/compile-data-to-link-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Paths
const sourcePatternsDir = path.join(projectRoot, 'src', 'data-raw', 'link-types', 'patterns');
const outputFilePath = path.join(projectRoot, 'src', 'config', 'data-generated', 'link-types.json');

function buildLinkTypes() {
  console.log('🔨 Building link-types.json file...\n');

  try {
    // Compile patterns from base directory only (overwrite mode)
    const result = compileDataToLinkTypes(sourcePatternsDir, outputFilePath, false);

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