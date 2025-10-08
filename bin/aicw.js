#!/usr/bin/env node

/*
   * AI Chat Watch (AICW)
   * Copyright (c) 2024-present Evgenii Mironichev and Contributors
   *
   * This software is licensed under the Elastic License 2.0 (ELv2).
   * You may not provide the software to third parties as a hosted or
   * managed service. See LICENSE.md for full terms.
*/

// Check Node.js version compatibility first
const nodeVersion = process.version;
const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);

if (major < 18) {
  console.error(`\x1b[31m❌ Node.js ${nodeVersion} is too old.\x1b[0m`);
  console.error('\x1b[33m💡 AI Chat Watch requires Node.js 18 or newer.\x1b[0m');
  console.error('\x1b[36m📥 Download the latest version from: https://nodejs.org/\x1b[0m\n');
  process.exit(1);
}

// No upper bound check - we support all modern Node.js versions

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFileSync, mkdirSync } from 'fs';
import { getUserDataDir } from '../dist/config/user-paths.js';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set up error logging to file - intercept console.error to also write to log
const originalConsoleError = console.error;
console.error = function(...args) {
  // Call original console.error first
  originalConsoleError.apply(console, args);
  
  // Also log to file (but don't crash if it fails)
  try {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        // Handle Error objects specially to get stack traces
        if (arg instanceof Error) {
          return arg.stack || arg.message;
        }
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    const logLine = `[${timestamp}] [ERROR] ${message}\n`;
    const logDir = getUserDataDir();
    const logFile = join(logDir, 'error.log');
    
    // Ensure directory exists
    try {
      mkdirSync(logDir, { recursive: true });
    } catch {
      // Directory might already exist or we can't create it
    }
    
    appendFileSync(logFile, logLine);
  } catch {
    // Silently ignore file write errors - we don't want logging to cause crashes
  }
};

// Global crash protection with user-friendly messages
process.on('uncaughtException', (error) => {
  console.error('\n❌ Oops! Something went wrong.');
  console.error('💡 Try running the command again.');

  // Only show technical details if in debug mode
  if (process.env.AICW_DEBUG === 'true') {
    console.error('\nTechnical details:', error.message || error);
  } else {
    console.error('\nFor more details, set AICW_DEBUG=true and try again.');
  }

  console.error('\nIf this keeps happening, please report it:');
  console.error('📧 https://github.com/aichatwatch/aicw/issues\n');

  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Oops! Something went wrong.');
  console.error('💡 Details: ' + reason);

  process.exit(1);
});

// API keys are now loaded from encrypted storage via loadEnvFile() in run.js
// No longer using dotenv - all API keys come from encrypted credentials.json

// Show development mode notice if applicable
if (process.env.AICW_DEV_MODE === 'true') {
  console.log('\x1b[33m[DEV MODE]\x1b[0m Auto-rebuild is active\n');
}

// Initialize user directories on first run (moved from post-install)
import { initializeUserDirectories } from '../dist/config/user-paths.js';
try {
  initializeUserDirectories();
} catch (error) {
  console.error('Warning: Could not create user directories:', error.message);
  // Continue anyway - directories will be created as needed
}

// Silent background check for updates (non-blocking)
import { silentUpdateCheck } from '../dist/utils/update-checker.js';
silentUpdateCheck().catch(() => {
  // Completely silent - no errors
});

// Import and run the main CLI
import '../dist/run.js';