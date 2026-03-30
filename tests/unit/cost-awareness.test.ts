import { describe, expect, it } from 'vitest';
import { estimateUsdFromTokens, OPENAI_MODEL_PRICING } from '../../src/core/CostAwareness.js';
import { resolveCodexModel, resolveCopilotModel } from '../../src/core/models.js';

describe('CostAwareness', () => {
  it('exposes pricing for GPT-5 family models', () => {
    expect(OPENAI_MODEL_PRICING['gpt-5.4']).toBeDefined();
    expect(OPENAI_MODEL_PRICING['gpt-5']).toBeDefined();
    expect(OPENAI_MODEL_PRICING['gpt-5-mini']).toBeDefined();
  });

  it('estimates cost for uncached GPT-5 usage', () => {
    const usd = estimateUsdFromTokens('gpt-5', {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
    });

    expect(usd).toBe(11.25);
  });

  it('accounts for cached input pricing separately', () => {
    const usd = estimateUsdFromTokens('gpt-5.4', {
      inputTokens: 1_000_000,
      cachedInputTokens: 400_000,
      outputTokens: 100_000,
    });

    // 600k uncached * 2.5 + 400k cached * 0.25 + 100k output * 15
    expect(usd).toBe(3.1);
  });

  it('returns null for unknown models', () => {
    const usd = estimateUsdFromTokens('unknown-model', {
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 10,
    });

    expect(usd).toBeNull();
  });
});

describe('resolveCodexModel', () => {
  it('maps fast/balanced/capable tiers to codex models', () => {
    expect(resolveCodexModel('fast')).toBe('gpt-5-mini');
    expect(resolveCodexModel('balanced')).toBe('gpt-5');
    expect(resolveCodexModel('capable')).toBe('gpt-5.4');
  });

  it('passes through explicit model IDs', () => {
    expect(resolveCodexModel('gpt-5.4')).toBe('gpt-5.4');
  });
});

describe('resolveCopilotModel', () => {
  it('maps fast/balanced/capable tiers to cheap-first Copilot models', () => {
    expect(resolveCopilotModel('fast')).toBe('gpt-5-mini');
    expect(resolveCopilotModel('balanced')).toBe('gpt-4.1');
    expect(resolveCopilotModel('capable')).toBe('claude-sonnet-4.5');
  });

  it('passes through explicit Copilot model IDs', () => {
    expect(resolveCopilotModel('gpt-4.1')).toBe('gpt-4.1');
  });
});
