import { promises as fs } from 'fs';
import { ModelConfig } from '../utils/model-config.js';
import { colorize } from '../utils/misc-utils.js';
import { createAiClientInstance, callAIWithRetry } from '../utils/ai-caller.js';
import { loadAllModels } from '../ai-preset-manager.js';
import { PipelineCriticalError } from '../utils/pipeline-errors.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

import { CompactLogger } from '../utils/compact-logger.js';
const logger = CompactLogger.getInstance();

interface ModelCheckResult {
  id: string;
  display_name: string;
  status: 'ok' | 'error' | 'unauthorized' | 'not_found' | 'deprecated';
  statusCode?: number;
  error?: string;
  responseTime?: number;
  api_url: string;
  model: string;
}

async function checkModel(cfg: ModelConfig): Promise<ModelCheckResult> {
  const startTime = Date.now();

  try {
    const aiClientInstance = createAiClientInstance(cfg);

    // Send a minimal test message using centralized retry logic
    const response = await callAIWithRetry(
      aiClientInstance,
      cfg,      
      {
        model: cfg.model,
        messages: [{ role: 'user', content: 'Say "OK" if you can read this.' }],
        max_tokens: 10
      },       
      {
        contextInfo: `Testing model ${cfg.id}`,
        maxRetries: 3, // Use fewer retries for model checking
        mergeextra_body: false, // we set it to false because we need this call for very simple check only
        cacheNamePrefix: CURRENT_MODULE_NAME
      }
    );

    const responseTime = Date.now() - startTime;

    if (response.choices?.[0]?.message?.content) {
      return {
        id: cfg.id,
        display_name: cfg.display_name,
        status: 'ok',
        responseTime,
        api_url: cfg.api_url,
        model: cfg.model
      };
    } else {
      return {
        id: cfg.id,
        display_name: cfg.display_name,
        status: 'error',
        error: 'Empty response',
        responseTime,
        api_url: cfg.api_url,
        model: cfg.model
      };
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    // Determine status based on error
    let status: ModelCheckResult['status'] = 'error';
    let statusCode: number | undefined;
    let errorMessage = error.message || String(error);
    
    if (error.status) {
      statusCode = error.status;
      if (statusCode === 401) {
        status = 'unauthorized';
        errorMessage = 'Unauthorized (401)';
      } else if (statusCode === 403) {
        status = 'unauthorized';
        errorMessage = 'Forbidden (403)';
      } else if (statusCode === 404) {
        status = 'not_found';
        errorMessage = 'Model not found (404)';
      } else if (statusCode === 410) {
        status = 'deprecated';
        errorMessage = 'Model deprecated (410)';
      } else if (statusCode >= 400 && statusCode < 500) {
        status = 'error';
        errorMessage = `Client error (${statusCode})`;
      } else if (statusCode >= 500) {
        status = 'error';
        errorMessage = `Server error (${statusCode})`;
      }
    }
    
    // Check for specific error messages that indicate deprecation
    if (errorMessage.toLowerCase().includes('deprecated') || 
        errorMessage.toLowerCase().includes('no longer available') ||
        errorMessage.toLowerCase().includes('not available')) {
      status = 'deprecated';
    }
    
    return {
      id: cfg.id,
      display_name: cfg.display_name,
      status,
      statusCode,
      error: errorMessage,
      responseTime,
      api_url: cfg.api_url,
      model: cfg.model
    };
  }
}

async function main() {
  logger.info(colorize('\n🔍 AI Search Watch - Model Availability Checker', 'bright'));
  logger.info(colorize('━'.repeat(50), 'dim'));
  
  logger.info('');
  
  const results: ModelCheckResult[] = [];
  const modelsToRemove: string[] = [];
  const problematicModels: ModelCheckResult[] = [];

  const allModels = loadAllModels();
  
  // Group models by API key to check if keys are set
  const apiKeys = new Set(allModels.map(m => m.api_key_env));
  const missingKeys: string[] = [];
  
  for (const key of apiKeys) {
    if (!process.env[key]) {
      missingKeys.push(key);
    }
  }
  
  if (missingKeys.length > 0) {
    logger.error(`Missing API keys: ${missingKeys.join(', ')}`);    
    throw new PipelineCriticalError(`Missing API keys: ${missingKeys.join(', ')}`, 'check-models');
  }
  
  // Check each model
  for (let i = 0; i < allModels.length; i++) {
    const model = allModels[i];
    process.stdout.write(`[${i + 1}/${allModels.length}] Checking ${model.display_name}... `);
    
    const result = await checkModel(model);
    results.push(result);
    
    if (result.status === 'ok') {
      console.log(colorize('✓', 'green') + ` (${result.responseTime}ms)`);
    } else if (result.status === 'unauthorized') {
      console.log(colorize('⚠', 'yellow') + ` ${result.error}`);
      if (!missingKeys.includes(model.api_key_env)) {
        problematicModels.push(result);
      }
    } else if (result.status === 'not_found' || result.status === 'deprecated') {
      console.log(colorize('✗', 'red') + ` ${result.error}`);
      modelsToRemove.push(model.id);
      problematicModels.push(result);
    } else {
      console.log(colorize('✗', 'red') + ` ${result.error}`);
      problematicModels.push(result);
    }
  }
  
  console.log();
  console.log(colorize('━'.repeat(50), 'dim'));
  
  // Summary
  const okCount = results.filter(r => r.status === 'ok').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const unauthorizedCount = results.filter(r => r.status === 'unauthorized').length;
  const notFoundCount = results.filter(r => r.status === 'not_found' || r.status === 'deprecated').length;
  
  console.log(colorize('\n📊 Summary:', 'bright'));
  console.log(`  ${colorize('✓', 'green')} Working: ${okCount}`);
  console.log(`  ${colorize('⚠', 'yellow')} Unauthorized: ${unauthorizedCount}`);
  console.log(`  ${colorize('✗', 'red')} Not found/Deprecated: ${notFoundCount}`);
  console.log(`  ${colorize('✗', 'red')} Other errors: ${errorCount}`);
  
  // Models to remove
  if (modelsToRemove.length > 0) {
    console.log(colorize('\n🗑️  Models to Remove from answers.json:', 'red'));
    console.log(colorize('These models returned 404/410 or are deprecated:', 'dim'));
    for (const modelId of modelsToRemove) {
      const model = allModels.find(m => m.id === modelId);
      console.log(`  - ${colorize(modelId, 'red')} (${model?.display_name})`);
    }
    
    console.log(colorize('\nTo fix this:', 'yellow'));
    console.log('1. Edit: src/config/models/ai_models.json');
    console.log('2. Remove the model entries listed above');
    console.log('3. Run: npm run build');
  }
  
  // Other problematic models
  const otherProblems = problematicModels.filter(r => !modelsToRemove.includes(r.id));
  if (otherProblems.length > 0) {
    console.log(colorize('\n⚠️  Other Issues:', 'yellow'));
    for (const result of otherProblems) {
      console.log(`  - ${colorize(result.id, 'yellow')} (${result.display_name}): ${result.error}`);
    }
  }
  
  // Working models
  const workingModels = results.filter(r => r.status === 'ok');
  if (workingModels.length > 0) {
    console.log(colorize('\n✅ Working Models:', 'green'));
    for (const result of workingModels) {
      console.log(`  - ${colorize(result.id, 'green')} (${result.display_name}) - ${result.responseTime}ms`);
    }
  }
  
  console.log();
}

main().catch(err => {
  logger.error('Failed to check models:');
  console.error(err);
  process.exit(1);
});
