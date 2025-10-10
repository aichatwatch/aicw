import { existsSync } from 'fs';
import path from 'path';
import { getAllScriptPaths, getCliCommands } from '../config/pipelines-and-actions.js';
import { getPackageRoot } from '../config/user-paths.js';
import { CompactLogger } from './compact-logger.js';
const logger = CompactLogger.getInstance();
import { COLORS } from './misc-utils.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ScriptValidationResult {
  /** Script path (without .js) */
  scriptPath: string;
  /** Whether the script file exists */
  exists: boolean;
  /** Full filesystem path that was checked */
  fullPath: string;
}

export interface ScriptsValidationReport {
  /** Total number of scripts checked */
  total: number;
  /** Number of scripts that exist */
  existingScriptsCount: number;
  /** Number of missing scripts */
  missing: number;
  /** Whether all scripts are valid */
  allExistingScriptsAreValid: boolean;
  /** Detailed results for each script */
  results: ScriptValidationResult[];
  /** List of missing script paths */
  missingScripts: string[];
}

// ============================================================================
// VERIFICATION FUNCTIONS
// ============================================================================

/**
 * Verify that a single script exists
 */
export function verifyScript(scriptPath: string): ScriptValidationResult {
  const packageRoot = getPackageRoot();
  const scriptFile = `${scriptPath}.js`;
  // Note: getPackageRoot() returns the dist folder, not the package root
  const fullPath = path.join(packageRoot, scriptFile);
  const exists = existsSync(fullPath);

  return {
    scriptPath,
    exists,
    fullPath
  };
}

/**
 * Verify all scripts from pipeline registry
 */
export function verifyAllScripts(): ScriptsValidationReport {
  const scriptPaths = getAllScriptPaths();
  const results: ScriptValidationResult[] = [];

  for (const scriptPath of scriptPaths) {
    // Skip empty script paths (used for commands that don't run scripts)
    if (!scriptPath) continue;

    results.push(verifyScript(scriptPath));
  }

  const existingScriptsCount = results.filter(r => r.exists).length;
  const missing = results.filter(r => !r.exists).length;
  const missingScripts = results.filter(r => !r.exists).map(r => r.scriptPath);

  return {
    total: results.length,
    existingScriptsCount,
    missing,
    allExistingScriptsAreValid: missing === 0,
    results,
    missingScripts,
  };
}

/**
 * Verify CLI command scripts only (faster than full verification)
 */
export function verifyCliScripts(): ScriptsValidationReport {
  const cliCommands = getCliCommands();
  const scriptPaths = cliCommands
    .map(action => action.cmd)
    .filter(cmd => cmd !== ''); // Filter out empty scripts

  const uniquePaths = Array.from(new Set(scriptPaths));
  const results: ScriptValidationResult[] = [];

  for (const scriptPath of uniquePaths) {
    results.push(verifyScript(scriptPath));
  }

  const existingScriptsCount = results.filter(r => r.exists).length;
  const missing = results.filter(r => !r.exists).length;
  const missingScripts = results.filter(r => !r.exists).map(r => r.scriptPath);

  return {
    total: results.length,
    existingScriptsCount,
    missing,
    allExistingScriptsAreValid: missing === 0,
    results,
    missingScripts,
  };
}

// ============================================================================
// REPORTING FUNCTIONS
// ============================================================================

/**
 * Format validation report as human-readable text
 */
export function formatReport(report: ScriptsValidationReport, options: { verbose?: boolean } = {}): string {
  const lines: string[] = [];

  if (report.allExistingScriptsAreValid) {
    lines.push(`✓ All ${report.total} scripts verified successfully`);
  } else {
    lines.push(`✗ Validation failed: ${report.missing} of ${report.total} scripts are missing`);
    lines.push('');
    lines.push('Missing scripts:');
    for (const scriptPath of report.missingScripts) {
      const result = report.results.find(r => r.scriptPath === scriptPath);
      lines.push(`  • ${scriptPath}.js$`);
      if (options.verbose && result) {
        lines.push(`    Expected at: ${result.fullPath}`);
      }
    }
  }

  if (options.verbose && report.allExistingScriptsAreValid) {
    lines.push('');
    lines.push('Verified scripts:');
    const grouped = groupByDirectory(report.results);
    for (const [dir, scripts] of Object.entries(grouped)) {
      const dirName = dir || 'root';
      lines.push(`  ${dirName}/ (${scripts.length} scripts)`);
      for (const script of scripts) {
        lines.push(`    ✓ ${path.basename(script.scriptPath)}.js`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Group scripts by directory for better reporting
 */
function groupByDirectory(results: ScriptValidationResult[]): Record<string, ScriptValidationResult[]> {
  const grouped: Record<string, ScriptValidationResult[]> = {};

  for (const result of results) {
    const dir = path.dirname(result.scriptPath);
    if (!grouped[dir]) {
      grouped[dir] = [];
    }
    grouped[dir].push(result);
  }

  return grouped;
}

/**
 * Print validation report to console with colors
 */
export function printReport(report: ScriptsValidationReport, options: { verbose?: boolean } = {}): void {

  if (report.allExistingScriptsAreValid) {
    logger.info(`${COLORS.green}✓ All ${report.total} scripts verified successfully${COLORS.reset}`);
  } else {
    console.error(`${COLORS.red}✗ Validation failed: ${report.missing} of ${report.total} scripts are missing${COLORS.reset}`);
    console.error('');
    console.error(`${COLORS.yellow}Missing scripts:${COLORS.reset}`);
    for (const scriptPath of report.missingScripts) {
      const result = report.results.find(r => r.scriptPath === scriptPath);
      console.error(`  ${COLORS.red}•${COLORS.reset} ${scriptPath}.js$`);
      if (options.verbose && result) {
        console.error(`    ${COLORS.dim}Expected at: ${result.fullPath}${COLORS.reset}`);
      }
    }
    console.error('');
    console.error(`${COLORS.yellow}💡 Suggestion:${COLORS.reset} Run ${COLORS.green}npm run build${COLORS.reset} to compile all scripts`);
  }
}

// ============================================================================
// STARTUP VERIFICATION
// ============================================================================

/**
 * Verify scripts on startup (called from main entry point)
 * Exits process if validation fails.
 */
export function verifyOnStartup(options: { verbose?: boolean; exitOnFailure?: boolean } = {}): boolean {
  const { verbose = false, exitOnFailure = true } = options;

  const report = verifyAllScripts();

  if (!report.allExistingScriptsAreValid) {
    printReport(report, { verbose });

    if (exitOnFailure) {
      console.error('');
      console.error('Cannot start application with missing scripts.');
      process.exit(1);
    }

    return false;
  }

  if (verbose) {
    printReport(report, { verbose });
  }

  return true;
}

/**
 * Quick startup check - only verifies CLI scripts (faster)
 */
export function quickVerifyOnStartup(options: { exitOnFailure?: boolean } = {}): boolean {
  const { exitOnFailure = true } = options;

  const report = verifyCliScripts();

  if (!report.allExistingScriptsAreValid && exitOnFailure) {
    printReport(report);
    console.error('');
    console.error('Cannot start application with missing CLI scripts.');
    process.exit(1);
  }

  return report.allExistingScriptsAreValid;
}