#!/usr/bin/env node

import { spawnSync, spawn } from 'child_process';
import { existsSync, statSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Colors for output
const COLORS = {
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  reset: '\x1b[0m'
};

// Check if we need to rebuild
function shouldRebuild() {
  const srcDir = join(projectRoot, 'src');
  const distDir = join(projectRoot, 'dist');
  const lastBuildFile = join(projectRoot, '.last-build');
  
  // If dist doesn't exist, definitely rebuild
  if (!existsSync(distDir)) {
    return true;
  }
  
  // Get last build time
  let lastBuildTime = 0;
  if (existsSync(lastBuildFile)) {
    try {
      lastBuildTime = parseInt(readFileSync(lastBuildFile, 'utf-8'));
    } catch (e) {
      // Ignore errors, just rebuild
    }
  }
  
  // Check if any TypeScript file is newer than last build
  const checkDir = (dir) => {
    if (!existsSync(dir)) return false;
    
    const files = readdirSync(dir);
    for (const file of files) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (checkDir(fullPath)) return true;
      } else if (file.endsWith('.ts')) {
        if (stat.mtimeMs > lastBuildTime) {
          return true;
        }
      }
    }
    return false;
  };
  
  // Also check package.json and tsconfig.json
  const configFiles = ['package.json', 'tsconfig.json'];
  for (const file of configFiles) {
    const path = join(projectRoot, file);
    if (existsSync(path) && statSync(path).mtimeMs > lastBuildTime) {
      return true;
    }
  }
  
  return checkDir(srcDir);
}

// Import after potential rebuild
async function runCLI() {
  // First, check if we're in the right directory
  if (!existsSync(join(projectRoot, 'package.json'))) {
    console.error('Error: Not in a valid aicw project directory');
    process.exit(1);
  }
  
  // Check if we need to rebuild
  if (shouldRebuild()) {
    console.log(`${COLORS.yellow}🔨 Development mode: Rebuilding project...${COLORS.reset}`);
    
    const buildResult = spawnSync('npm', ['run', 'build'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true
    });
    
    if (buildResult.status !== 0) {
      console.error(`${COLORS.yellow}❌ Build failed! Fix errors and try again.${COLORS.reset}`);
      process.exit(1);
    }
    
    // Update last build time
    writeFileSync(join(projectRoot, '.last-build'), Date.now().toString());
    console.log(`${COLORS.green}✓ Build successful!${COLORS.reset}\n`);
  }
  
  // Now run the actual CLI
  await import('./aicw.js');
}

// Add missing import
import { readdirSync } from 'fs';

// Mark as development mode
process.env.AICW_DEV_MODE = 'true';

// Show dev mode banner
console.log(`${COLORS.blue}🚀 AI Chat Watch - Development Mode${COLORS.reset}`);
console.log(`${COLORS.dim}Auto-rebuild enabled. Use 'aicw' (without -dev) for production mode.${COLORS.reset}\n`);

// Run the CLI
runCLI().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});