/**
 * API Key validation and testing
 */

import { OpenAI } from 'openai';
import { colorize } from './misc-utils.js';
import { Spinner } from './compact-logger.js';
import { UserFriendlyError, ErrorCode } from '../utils/error-handler.js';
import { createAiClientInstance } from './ai-caller.js';
import { CompactLogger } from '../utils/compact-logger.js';
const logger = CompactLogger.getInstance();

/**
 * Validate API key format
 */
export function validateApiKey(key: string): boolean {
  if (!key || key.trim().length === 0) {
    return false;
  }

  // OpenRouter keys typically start with sk-or-
  // OpenAI keys typically start with sk-
  const validPatterns = [
    /^sk-or-v\d-[a-zA-Z0-9]{48,}$/,  // OpenRouter format
    /^sk-[a-zA-Z0-9]{48,}$/,          // OpenAI format
    /^sk-proj-[a-zA-Z0-9]{48,}$/      // OpenAI project keys
  ];

  return validPatterns.some(pattern => pattern.test(key.trim()));
}

/**
 * Test API key by making a simple request
 */
export async function testApiKey(
  key: string,
  api_url: string = 'https://openrouter.ai/api/v1'
): Promise<{ isValid: boolean; error?: string; provider?: string }> {
  const spinner = new Spinner('Testing API key connection...');
  spinner.start();

  try {
    const client = createAiClientInstance(null, api_url);

    // Make a minimal test request
    const response = await client.chat.completions.create({
      model: api_url.includes('openrouter') ? 'meta-llama/llama-3.2-1b-instruct:free' : 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1
    });

    spinner.stop();

    if (response.choices && response.choices.length > 0) {
      const provider = api_url.includes('openrouter') ? 'OpenRouter' : 'OpenAI';
      console.log(colorize(`✓ API key validated successfully (${provider})`, 'green'));
      return { isValid: true, provider };
    } else {
      return { isValid: false, error: 'Unexpected response format' };
    }
  } catch (error: any) {
    spinner.stop();

    // Parse error message
    let errorMessage = 'Connection failed';

    if (error.status === 401) {
      errorMessage = 'Invalid API key - please check and try again';
    } else if (error.status === 429) {
      errorMessage = 'Rate limit hit - key is valid but has usage limits';
      // This is actually a success - the key works!
      console.log(colorize('✓ API key is valid (rate limited)', 'yellow'));
      return { isValid: true, error: errorMessage };
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Cannot reach API server - check internet connection';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return { isValid: false, error: errorMessage };
  }
}

/**
 * Interactive API key setup with validation
 */
export async function setupApiKeyInteractive(rl: any): Promise<{ key: string; provider: string }> {
  console.log('\n' + colorize('🔑 API Key Setup', 'cyan'));
  console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim'));

  console.log('\nYou need an API key to use AI Chat Watch.');
  console.log('\n' + colorize('Recommended: OpenRouter', 'green'));
  console.log('  • Get a free key: ' + colorize('https://openrouter.ai/keys', 'cyan'));
  console.log('  • Many models have free tiers');
  console.log('  • Single API for 20+ AI models');

  console.log('\n' + colorize('Alternative: OpenAI', 'yellow'));
  console.log('  • Get a key: ' + colorize('https://platform.openai.com/api-keys', 'cyan'));
  console.log('  • Requires payment (no free tier)');
  console.log('  • Access to GPT models only');

  let validKey: string | null = null;
  let provider: string = 'OpenRouter';
  let attempts = 0;
  const maxAttempts = 3;

  while (!validKey && attempts < maxAttempts) {
    attempts++;

    const input = await new Promise<string>((resolve) => {
      rl.question('\nEnter your API key (or "skip" to set up later): ', (answer: string) => {
        resolve(answer.trim());
      });
    });

    if (input.toLowerCase() === 'skip') {
      console.log(colorize('\n⚠️  Skipping API key setup', 'yellow'));
      console.log('You can run "aicw setup" later to configure your API key.\n');
      throw new UserFriendlyError(ErrorCode.NO_API_KEY);
    }

    // Basic format validation
    if (!validateApiKey(input)) {
      console.error(colorize('\n❌ Invalid API key format', 'red'));
      console.log('API keys usually start with "sk-" and are at least 40 characters long.');

      if (attempts < maxAttempts) {
        console.log(`Try again (${maxAttempts - attempts} attempts remaining)`);
      }
      continue;
    }

    // Detect provider from key format
    const api_url = input.startsWith('sk-or-')
      ? 'https://openrouter.ai/api/v1'
      : 'https://api.openai.com/v1';

    // Test the API key
    console.log('');
    const result = await testApiKey(input, api_url);

    if (result.isValid) {
      validKey = input;
      provider = result.provider || provider;
      console.log(colorize('✓ API key saved successfully!', 'green'));
    } else {
      console.error(colorize(`\n❌ ${result.error}`, 'red'));

      if (attempts < maxAttempts) {
        console.log(`\nPlease try again (${maxAttempts - attempts} attempts remaining)`);
      }
    }
  }

  if (!validKey) {
    console.error(colorize('\n❌ Failed to validate API key after 3 attempts', 'red'));
    console.log('\nPlease check:');
    console.log('  1. You copied the entire API key');
    console.log('  2. The key hasn\'t expired');
    console.log('  3. Your internet connection is working');
    console.log('\nYou can try again with: ' + colorize('aicw setup', 'cyan'));
    throw new UserFriendlyError(ErrorCode.INVALID_API_KEY);
  }

  return { key: validKey, provider };
}

/**
 * Quick API connection test
 */
export async function quickApiTest(): Promise<boolean> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new UserFriendlyError(ErrorCode.NO_API_KEY);
  }

  const api_url = process.env.OPENROUTER_API_KEY
    ? 'https://openrouter.ai/api/v1'
    : 'https://api.openai.com/v1';

  const result = await testApiKey(apiKey, api_url);

  if (!result.isValid) {
    throw new UserFriendlyError(
      ErrorCode.INVALID_API_KEY,
      result.error
    );
  }

  return true;
}