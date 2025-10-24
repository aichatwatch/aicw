/**
 * AI Product Utilities
 *
 * Helper functions for grouping bots by AI products and calculating visibility.
 */

import { AI_USER_AGENTS, AIBotDefinition, AI_PRODUCTS } from '../../../config/ai-user-agents.js';

/**
 * Get all unique AI products
 * @returns Array of AI product names
 */
export function getUniqueAIProducts(): string[] {
  return Object.values(AI_PRODUCTS);
}

/**
 * Get all bots related to a specific AI product
 * Checks both related_ai_products field AND tags field (for CommonCrawl)
 *
 * @param productName - Name of AI product (e.g., "OpenAI ChatGPT")
 * @returns Array of bot definitions related to this product
 */
export function getBotsForProduct(productName: string): AIBotDefinition[] {
  return AI_USER_AGENTS.filter(bot => {
    // Check related_ai_products field
    if (bot.related_ai_products?.includes(productName)) {
      return true;
    }

    // Check tags field (used by CommonCrawl which applies to all products)
    if (bot.tags?.includes(productName)) {
      return true;
    }

    return false;
  });
}

/**
 * Calculate AI product visibility from bot check results
 *
 * @param blockedBotNames - Set of bot names that are blocked/inaccessible
 * @returns Map of product name to visibility status
 */
export function calculateProductVisibility(blockedBotNames: Set<string>): Map<string, boolean> {
  const productVisibility = new Map<string, boolean>();
  const products = getUniqueAIProducts();

  for (const product of products) {
    const productBots = getBotsForProduct(product);

    // Product is visible if ANY of its bots is accessible (not blocked)
    const isVisible = productBots.some(bot => !blockedBotNames.has(bot.name));

    productVisibility.set(product, isVisible);
  }

  return productVisibility;
}
