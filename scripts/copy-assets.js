#!/usr/bin/env node
/**
 * Copy non-TypeScript assets to dist/ after build
 * This ensures JSON files, templates, and other assets are available at runtime
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('📦 Copying assets to dist/...\n');

const assetsToCopy = [
  {
    from: 'src/config/data',
    to: 'dist/config/data',
    description: 'Config data (templates, prompts, models, etc.)'
  },
  {
    from: 'src/config/data-generated',
    to: 'dist/config/data-generated',
    description: 'Generated data (link-types etc)'
  },
  {
    from: 'LICENSE.md',
    to: 'dist/LICENSE.md',
    description: 'License'
  },
  {
    from: 'NOTICE.md',
    to: 'dist/NOTICE.md',
    description: 'Notice'
  },
  {
    from: 'README.md',
    to: 'dist/README.md',
    description: 'Readme'
  }
];

let totalCopied = 0;

for (const asset of assetsToCopy) {
  const fromPath = path.join(rootDir, asset.from);
  const toPath = path.join(rootDir, asset.to);

  try {
    if (!fs.existsSync(fromPath)) {
      console.log(`⚠️  Skipped: ${asset.description} (${asset.from} not found)`);
      continue;
    }

    // Copy directory recursively
    await copyFolderRecursively(fromPath, toPath);

    console.log(`✓ Copied: ${asset.description}`);
    console.log(`  ${asset.from} → ${asset.to}`);
    totalCopied++;
  } catch (error) {
    console.error(`✗ Failed to copy ${asset.description}:`, error.message);
  }
}

async function copyFolderRecursively(sourcePath, destinationPath) {
  try {
    await fs.cp(sourcePath, destinationPath, { recursive: true });
    console.log(`Successfully copied '${sourcePath}' to '${destinationPath}' recursively.`);
  } catch (err) {
    console.error(`Error copying folder: ${err}`);
    throw err;
  }
}

console.log(`\n✨ Asset copy complete! (${totalCopied}/${assetsToCopy.length} copied)\n`);