/**
 * Pricing map for supported models
 * Last updated: 2026-03-29
 * Source: OpenAI public pricing
 */

export interface ModelPricing {
  inputPer1M: number; // USD per 1M input tokens
  outputPer1M: number; // USD per 1M output tokens
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Economy tier
  "gpt-4o-mini": {
    inputPer1M: 0.15,
    outputPer1M: 0.60,
  },
  // Standard tier
  "gpt-4o": {
    inputPer1M: 2.5,
    outputPer1M: 10.0,
  },
  // High tier
  "gpt-4x": {
    inputPer1M: 30.0,
    outputPer1M: 60.0,
  },
};

export const TIER_MAPPING = {
  economy: "gpt-4o-mini",
  standard: "gpt-4o",
  high: "gpt-4x",
} as const;

export type ModelTier = keyof typeof TIER_MAPPING;

/**
 * Calculate estimated cost for a model call
 * @param model Model name (e.g., "gpt-4o-mini")
 * @param inputTokens Number of input tokens
 * @param estimatedOutputTokens Estimated output tokens
 * @returns Estimated cost in USD
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  estimatedOutputTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    throw new Error(`Unknown model: ${model}`);
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (estimatedOutputTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + outputCost;
}

/**
 * Get the model name for a given tier
 */
export function getTierModel(tier: ModelTier): string {
  return TIER_MAPPING[tier];
}

/**
 * Get the tier for a given model
 */
export function getModelTier(model: string): ModelTier | null {
  for (const [tier, tierModel] of Object.entries(TIER_MAPPING)) {
    if (tierModel === model) {
      return tier as ModelTier;
    }
  }
  return null;
}
