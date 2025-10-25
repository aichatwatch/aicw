import { ModelConfig } from './model-config.js';

/**
 * Single source of truth for all influence calculations in the application.
 * Influence represents how important an item is based on:
 * - How many times it was mentioned (mentions)
 * - Where it appeared in answers (appearanceOrder - order of appearance)
 * - Which models mentioned it (model weights based on user base)
 */

/**
 * Normalize model weights so they sum to 1.0 across all models
 * This ensures consistent influence calculations regardless of number of models
 */
export function normalizeModelWeights(models: ModelConfig[]): Map<string, number> {
  const weights = new Map<string, number>();

  // Calculate raw weights based on estimated active users
  let totalWeight = 0;
  for (const model of models) {
    let weight = 0.5; // Default weight if no user data

    if (model.estimated_mau && model.estimated_mau > 0) {
      // Normalize to 0-1 scale (assuming max 1 billion users)
      weight = Math.min(model.estimated_mau / 1000000000, 1);
    }

    weights.set(model.id, weight);
    totalWeight += weight;
  }

  // Normalize so sum equals 1.0
  if (totalWeight > 0) {
    for (const [modelId, weight] of weights) {
      weights.set(modelId, weight / totalWeight);
    }
  }

  return weights;
}

/**
 * Calculate influence score for a single item
 *
 * @param mentions - Total number of times the item was mentioned
 * @param appearanceOrder - Average order of appearance across models (1 = first, 2 = second, etc.)
 * @param modelWeight - Normalized weight of models that mentioned this item
 * @param maxMentions - Maximum mentions across all items (for normalization)
 * @returns Influence score between 0.0 and 1.0
 */
export function calculateInfluence(
  mentions: number,
  appearanceOrder: number,
  modelWeight: number,
  maxMentions: number
): number {
  if (mentions === 0 || maxMentions === 0) {
    return 0;
  }

  // Mention score: normalized by max mentions
  const mentionScore = mentions / maxMentions;

  // AppearanceOrder score: items appearing earlier get higher scores
  // Using logarithmic decay: appearanceOrder 1 = 1.0, appearanceOrder 2 = 0.63, appearanceOrder 5 = 0.43, etc.
  const appearanceOrderScore = appearanceOrder > 0 ? 1 / Math.log2(appearanceOrder + 1) : 0;

  // Combine all factors
  // Model weight is already normalized (0-1)
  const influence = mentionScore * appearanceOrderScore * modelWeight;

  // Ensure result is between 0 and 1
  return Math.min(1, Math.max(0, influence));
}

/**
 * Calculate weighted influence for an item based on mentions by different models
 * This is the primary influence calculation used throughout the application
 *
 * @param mentionsByModel - Object mapping model IDs to mention counts
 * @param appearanceOrderByModel - Object mapping model IDs to appearanceOrder (order of appearance)
 * @param normalizedWeights - Pre-normalized model weights
 * @param maxMentions - Maximum mentions for any item (for normalization)
 * @returns Total weighted influence (0.0 to 1.0)
 */
export function calculateWeightedInfluence(
  mentionsByModel: { [modelId: string]: number },
  appearanceOrderByModel: { [modelId: string]: number },
  normalizedWeights: Map<string, number>,
  maxMentions: number
): number {
  let totalInfluence = 0;
  let totalWeight = 0;

  for (const [modelId, mentions] of Object.entries(mentionsByModel)) {
    if (mentions > 0) {
      const weight = normalizedWeights.get(modelId) || 0;
      const appearanceOrder = appearanceOrderByModel[modelId] || 999; // High number if appearanceOrder unknown

      // Calculate influence for this model's mention
      const modelInfluence = calculateInfluence(mentions, appearanceOrder, 1, maxMentions);

      totalInfluence += modelInfluence * weight;
      totalWeight += weight;
    }
  }

  // Normalize by total weight of models that mentioned the item
  if (totalWeight > 0) {
    return Number(totalInfluence.toFixed(5));
  }

  return 0;
}

/**
 * Calculate per-model influence values
 * Shows how much influence each model contributes to an item
 *
 * @param mentionsByModel - Object mapping model IDs to mention counts
 * @param appearanceOrderByModel - Object mapping model IDs to appearanceOrder
 * @param normalizedWeights - Pre-normalized model weights
 * @param maxMentionsByModel - Maximum mentions per model for normalization
 * @returns Object mapping model IDs to their influence contribution
 */
export function calculateInfluenceByModel(
  mentionsByModel: { [modelId: string]: number },
  appearanceOrderByModel: { [modelId: string]: number },
  normalizedWeights: Map<string, number>,
  maxMentionsByModel: Map<string, number>
): { [modelId: string]: number } {
  const influenceByModel: { [modelId: string]: number } = {};

  for (const [modelId, mentions] of Object.entries(mentionsByModel)) {
    const weight = normalizedWeights.get(modelId) || 0;
    const appearanceOrder = appearanceOrderByModel[modelId] || 999;
    const maxMentions = maxMentionsByModel.get(modelId) || 1;

    // Calculate this model's influence contribution
    const influence = calculateInfluence(mentions, appearanceOrder, weight, maxMentions);
    influenceByModel[modelId] = Number(influence.toFixed(5));
  }

  return influenceByModel;
}

/**
 * Normalize influence values so the maximum is 1.0 (100%)
 * Ensures the best-performing item has exactly 100% influence
 */
export function normalizeInfluences(items: any[]): void {
  if (!items || items.length === 0) return;

  // Find max influence across all items
  const maxInfluence = Math.max(...items.map(item => item.influence || 0));
  if (maxInfluence === 0) return;

  // Normalize all influence values
  items.forEach(item => {
    if (item.influence) {
      item.influence = Number((item.influence / maxInfluence).toFixed(5));
      item.weightedInfluence = item.influence; // Keep backward compatibility
    }

    // Normalize per-model influences too
    if (item.influenceByModel) {
      const maxModelInfluence = Math.max(...Object.values(item.influenceByModel).map(v => Number(v) || 0));
      if (maxModelInfluence > 0) {
        for (const modelId in item.influenceByModel) {
          item.influenceByModel[modelId] = Number(
            (item.influenceByModel[modelId] / maxModelInfluence).toFixed(5)
          );
        }
      }
    }
  });
}

/**
 * Calculate influence for all items in a batch
 * This handles the full enrichment process including appearanceOrder calculation
 *
 * @param items - Array of items to calculate influence for
 * @param models - Array of model configurations
 * @returns The items with influence values added
 */
export function calculateInfluenceForItems(
  items: any[],
  models: ModelConfig[]
): any[] {
  if (!items || items.length === 0) {
    return items;
  }

  // Get normalized weights once
  const normalizedWeights = normalizeModelWeights(models);

  // Find max mentions across all items and per model
  let maxMentionsOverall = 0;
  const maxMentionsByModel = new Map<string, number>();

  for (const item of items) {
    if (item.mentions > maxMentionsOverall) {
      maxMentionsOverall = item.mentions;
    }

    if (item.mentionsByModel) {
      for (const [modelId, mentions] of Object.entries(item.mentionsByModel)) {
        const current = maxMentionsByModel.get(modelId) || 0;
        if ((mentions as number) > current) {
          maxMentionsByModel.set(modelId, mentions as number);
        }
      }
    }
  }

  // Calculate influence for each item
  for (const item of items) {
    // Skip if no mentions
    if (!item.mentions || item.mentions === 0) {
      item.influence = 0;
      item.influenceByModel = {};
      continue;
    }

    // Ensure we have appearanceOrder data (use high number if missing)
    if (!item.appearanceOrderByModel) {
      item.appearanceOrderByModel = {};
      for (const model of models) {
        if (item.mentionsByModel && item.mentionsByModel[model.id]) {
          item.appearanceOrderByModel[model.id] = 999; // Unknown appearanceOrder
        }
      }
    }

    // Calculate average appearanceOrder if not already set
    if (!item.appearanceOrder || item.appearanceOrder === -1) {
      const appearanceOrders = Object.values(item.appearanceOrderByModel).filter((p): p is number => typeof p === 'number' && p > 0);
      if (appearanceOrders.length > 0) {
        item.appearanceOrder = appearanceOrders.reduce((a: number, b: number) => a + b, 0) / appearanceOrders.length;
      } else {
        item.appearanceOrder = 999;
      }
    }

    // Calculate weighted influence
    item.influence = calculateWeightedInfluence(
      item.mentionsByModel || {},
      item.appearanceOrderByModel || {},
      normalizedWeights,
      maxMentionsOverall
    );

    // Calculate per-model influence
    item.influenceByModel = calculateInfluenceByModel(
      item.mentionsByModel || {},
      item.appearanceOrderByModel || {},
      normalizedWeights,
      maxMentionsByModel
    );

    // Keep weightedInfluence for backward compatibility
    item.weightedInfluence = item.influence;
  }

  // Normalize all influences so max = 1.0
  normalizeInfluences(items);

  return items;
}