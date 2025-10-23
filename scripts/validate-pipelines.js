#!/usr/bin/env node
/**
 * Validate pipelines.json configuration
 * Runs before build to catch configuration errors early
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Color helpers for terminal output
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  dim: (text) => `\x1b[2m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`
};

const PIPELINES_JSON_PATH = path.join(rootDir, 'src', 'config', 'data', 'pipelines.json');

// Validation result tracking
const errors = [];
const warnings = [];
let totalChecks = 0;
let passedChecks = 0;

/**
 * Add error to list
 */
function addError(message) {
  errors.push(message);
}

/**
 * Add warning to list
 */
function addWarning(message) {
  warnings.push(message);
}

/**
 * Load and parse pipelines.json
 */
function loadPipelinesConfig() {
  totalChecks++;

  if (!fs.existsSync(PIPELINES_JSON_PATH)) {
    addError(`pipelines.json not found at: ${PIPELINES_JSON_PATH}`);
    return null;
  }

  try {
    const content = fs.readFileSync(PIPELINES_JSON_PATH, 'utf-8');
    const config = JSON.parse(content);
    passedChecks++;
    return config;
  } catch (error) {
    addError(`Failed to parse pipelines.json: ${error.message}`);
    return null;
  }
}

/**
 * Validate JSON structure
 */
function validateJsonStructure(config) {
  console.log(colors.cyan('\n📋 Validating JSON structure...'));

  totalChecks++;
  if (!config || typeof config !== 'object') {
    addError('pipelines.json must be a valid JSON object');
    return false;
  }
  passedChecks++;

  totalChecks++;
  if (!Array.isArray(config.actions)) {
    addError('pipelines.json must have "actions" array');
    return false;
  }
  passedChecks++;

  totalChecks++;
  if (!Array.isArray(config.pipelines)) {
    addError('pipelines.json must have "pipelines" array');
    return false;
  }
  passedChecks++;

  console.log(colors.green('  ✓ Valid JSON structure'));
  return true;
}

/**
 * Validate actions array
 */
function validateActions(actions, categories) {
  console.log(colors.cyan(`\n🎬 Validating ${actions.length} actions...`));

  const actionIds = new Set();
  const requiredFields = ['id', 'cmd', 'name', 'desc', 'pipelines', 'category'];

  for (const action of actions) {
    totalChecks++;

    // Check required fields
    const missingFields = requiredFields.filter(field => !action[field]);
    if (missingFields.length > 0) {
      addError(`Action missing required fields: ${missingFields.join(', ')} (id: ${action.id || 'unknown'})`);
      continue;
    }
    passedChecks++;

    totalChecks++;
    // Check for duplicate IDs
    if (actionIds.has(action.id)) {
      addError(`Duplicate action ID: "${action.id}"`);
      continue;
    }
    actionIds.add(action.id);
    passedChecks++;

    totalChecks++;
    // Validate category


    const validCategories = categories.map(category => category.id);
    if (!validCategories.includes(action.category)) {
      addError(`Invalid category "${action.category}" for action "${action.id}". Must be one of: ${validCategories.join(', ')}`);
      continue;
    }
    passedChecks++;

    totalChecks++;
    // Validate pipelines is array
    if (!Array.isArray(action.pipelines)) {
      addError(`Action "${action.id}" pipelines must be an array`);
      continue;
    }
    passedChecks++;
  }

  console.log(colors.green(`  ✓ All action IDs unique (${actionIds.size} actions)`));
  console.log(colors.green(`  ✓ All required fields present`));
  console.log(colors.green(`  ✓ All categories valid`));

  return actionIds;
}

/**
 * Validate pipelines array
 */
function validatePipelines(pipelines, actions) {
  console.log(colors.cyan(`\n⚙️  Validating ${pipelines.length} pipelines...`));

  const pipelineIds = new Set();
  const requiredFields = ['id', 'name', 'description', 'category'];

  for (const pipeline of pipelines) {
    totalChecks++;

    // Check required fields
    const missingFields = requiredFields.filter(field => !pipeline[field]);
    if (missingFields.length > 0) {
      addError(`Pipeline missing required fields: ${missingFields.join(', ')} (id: ${pipeline.id || 'unknown'})`);
      continue;
    }
    passedChecks++;

    totalChecks++;
    // Check for duplicate IDs
    if (pipelineIds.has(pipeline.id)) {
      addError(`Duplicate pipeline ID: "${pipeline.id}"`);
      continue;
    }
    pipelineIds.add(pipeline.id);
    passedChecks++;

    totalChecks++;
    // Check that pipeline has actions
    const pipelineActions = actions.filter(action => action.pipelines.includes(pipeline.id));
    if (pipelineActions.length === 0) {
      addError(`Pipeline "${pipeline.id}" has no actions. Check that actions have "${pipeline.id}" in their pipelines array.`);
      continue;
    }
    passedChecks++;

    totalChecks++;
    // Validate nextPipeline reference if present
    if (pipeline.nextPipeline) {
      const nextPipelineExists = pipelines.some(p => p.id === pipeline.nextPipeline);
      if (!nextPipelineExists) {
        addError(`Pipeline "${pipeline.id}" references non-existent nextPipeline: "${pipeline.nextPipeline}"`);
        continue;
      }
    }
    passedChecks++;
  }

  console.log(colors.green(`  ✓ All pipeline IDs unique (${pipelineIds.size} pipelines)`));
  console.log(colors.green(`  ✓ All pipelines have actions`));
  console.log(colors.green(`  ✓ All nextPipeline references valid`));

  return pipelineIds;
}

/**
 * Validate cross-references between actions and pipelines
 */
function validateCrossReferences(actions, pipelines) {
  console.log(colors.cyan('\n🔗 Validating cross-references...'));

  const pipelineIds = new Set(pipelines.map(p => p.id));

  // Check for orphaned actions (not used by any pipeline)
  for (const action of actions) {
    totalChecks++;
    const usedByPipelines = pipelines.filter(p =>
      actions.filter(a => a.pipelines.includes(p.id)).some(a => a.id === action.id)
    );

    if (usedByPipelines.length === 0) {
      addWarning(`Action "${action.id}" is not used by any pipeline`);
    }
    passedChecks++;
  }

  // Check that all pipeline references in actions are valid
  for (const action of actions) {
    totalChecks++;
    for (const pipelineId of action.pipelines) {
      if (!pipelineIds.has(pipelineId)) {
        addError(`Action "${action.id}" references non-existent pipeline: "${pipelineId}"`);
      }
    }
    passedChecks++;
  }

  console.log(colors.green(`  ✓ Cross-references validated`));
}

/**
 * Validate that action files exist
 */
function validateFileExistence(actions) {
  console.log(colors.cyan('\n📁 Validating action files exist...'));

  let missingFiles = 0;

  for (const action of actions) {
    totalChecks++;
    const filePath = path.join(rootDir, 'src', `${action.cmd}.ts`);

    if (!fs.existsSync(filePath)) {
      addError(`Action "${action.id}" file not found: src/${action.cmd}.ts`);
      missingFiles++;
    } else {
      passedChecks++;
    }
  }

  if (missingFiles === 0) {
    console.log(colors.green(`  ✓ All ${actions.length} action files found`));
  } else {
    console.log(colors.red(`  ✗ ${missingFiles} action file(s) missing`));
  }
}

/**
 * Display validation summary
 */
function displaySummary() {
  console.log('\n' + '═'.repeat(60));
  console.log(colors.bold('Pipelines Validation Summary'));
  console.log('═'.repeat(60));

  console.log(`\nTotal checks: ${totalChecks}`);
  console.log(colors.green(`Passed: ${passedChecks}`));

  if (errors.length > 0) {
    console.log(colors.red(`Errors: ${errors.length}`));
  }

  if (warnings.length > 0) {
    console.log(colors.yellow(`Warnings: ${warnings.length}`));
  }

  // Display errors
  if (errors.length > 0) {
    console.log('\n' + colors.red(colors.bold('❌ ERRORS:')));
    errors.forEach((error, index) => {
      console.log(colors.red(`  ${index + 1}. ${error}`));
    });
  }

  // Display warnings
  if (warnings.length > 0) {
    console.log('\n' + colors.yellow(colors.bold('⚠️  WARNINGS:')));
    warnings.forEach((warning, index) => {
      console.log(colors.yellow(`  ${index + 1}. ${warning}`));
    });
  }

  console.log('\n' + '═'.repeat(60));

  if (errors.length === 0) {
    console.log(colors.green(colors.bold('✨ Validation passed!')));
    if (warnings.length > 0) {
      console.log(colors.yellow(`   (with ${warnings.length} warning${warnings.length > 1 ? 's' : ''})`));
    }
    console.log('═'.repeat(60) + '\n');
    return true;
  } else {
    console.log(colors.red(colors.bold(`❌ Validation failed with ${errors.length} error${errors.length > 1 ? 's' : ''}!`)));
    console.log('═'.repeat(60) + '\n');
    return false;
  }
}

/**
 * Main validation function
 */
function main() {
  console.log(colors.bold('\n🔍 Validating pipelines.json configuration...\n'));

  // Load config
  const config = loadPipelinesConfig();
  if (!config) {
    displaySummary();
    process.exit(1);
  }

  // Validate structure
  if (!validateJsonStructure(config)) {
    displaySummary();
    process.exit(1);
  }

  // Validate actions
  const actionIds = validateActions(config.actions, config.categories);

  // Validate pipelines
  const pipelineIds = validatePipelines(config.pipelines, config.actions);

  // Validate cross-references
  validateCrossReferences(config.actions, config.pipelines);

  // Validate file existence
  validateFileExistence(config.actions);

  // Display summary and exit
  const success = displaySummary();
  process.exit(success ? 0 : 1);
}

// Run validation
main();
