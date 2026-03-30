export interface ModelPricing {
  inputPerMillion: number;
  cachedInputPerMillion?: number;
  outputPerMillion: number;
}

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
}

/**
 * API-reference pricing snapshot used for internal routing and rough cost
 * accounting. Update when the OpenAI model pages change.
 */
export const OPENAI_MODEL_PRICING: Record<string, ModelPricing> = Object.freeze({
  'gpt-5.4': {
    inputPerMillion: 2.5,
    cachedInputPerMillion: 0.25,
    outputPerMillion: 15,
  },
  'gpt-5': {
    inputPerMillion: 1.25,
    cachedInputPerMillion: 0.125,
    outputPerMillion: 10,
  },
  'gpt-5-mini': {
    inputPerMillion: 0.25,
    cachedInputPerMillion: 0.025,
    outputPerMillion: 2,
  },
} as const);

export function estimateUsdFromTokens(model: string, usage: TokenUsage | null | undefined): number | null {
  if (!usage) return null;
  const pricing = OPENAI_MODEL_PRICING[model];
  if (!pricing) return null;

  const uncachedInputTokens = Math.max(0, usage.inputTokens - (usage.cachedInputTokens ?? 0));
  const cachedInputTokens = usage.cachedInputTokens ?? 0;

  const usd =
    (uncachedInputTokens / 1_000_000) * pricing.inputPerMillion
    + (cachedInputTokens / 1_000_000) * (pricing.cachedInputPerMillion ?? pricing.inputPerMillion)
    + (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;

  return Number(usd.toFixed(6));
}
