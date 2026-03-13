/**
 * TreeTriage — Layer relevance scoring for self-knowledge queries.
 *
 * Primary: Haiku LLM call to score which layers are relevant.
 * Fallback: Deterministic rule-based keyword matching when LLM unavailable.
 *
 * Born from: PROP-XXX (Self-Knowledge Tree for Instar Agents)
 */

import type { IntelligenceProvider } from '../core/types.js';
import type { SelfKnowledgeLayer, TriageResult } from './types.js';

const DEFAULT_THRESHOLD = 0.4;

// ── Keyword rules for fallback ─────────────────────────────────────

const LAYER_KEYWORDS: Record<string, string[]> = {
  identity: ['who', 'am i', 'name', 'values', 'voice', 'personality', 'identity', 'relationship', 'people'],
  experience: ['learn', 'lesson', 'experience', 'decision', 'knowledge', 'remember', 'history', 'past', 'pattern'],
  capabilities: ['can', 'tool', 'platform', 'skill', 'able', 'capability', 'do', 'feature', 'dispatch'],
  state: ['job', 'running', 'health', 'status', 'current', 'now', 'active', 'session', 'process'],
  evolution: ['goal', 'growth', 'growing', 'improve', 'evolve', 'future', 'next', 'trajectory', 'progress', 'autonomy'],
};

/**
 * Score layer relevance for a given query.
 */
export class TreeTriage {
  private intelligence: IntelligenceProvider | null;
  private threshold: number;

  constructor(intelligence: IntelligenceProvider | null, threshold?: number) {
    this.intelligence = intelligence;
    this.threshold = threshold ?? DEFAULT_THRESHOLD;
  }

  get relevanceThreshold(): number {
    return this.threshold;
  }

  /**
   * Triage a query to determine which layers to search.
   * Falls back to rule-based when LLM unavailable.
   */
  async triage(query: string, layers: SelfKnowledgeLayer[]): Promise<TriageResult> {
    const layerIds = layers.map(l => l.id);
    const start = Date.now();

    // Try LLM triage first
    if (this.intelligence) {
      try {
        const result = await this.llmTriage(query, layers);
        return result;
      } catch {
        // Fall through to rule-based
      }
    }

    // Rule-based fallback
    return this.ruleBasedTriage(query, layerIds, start);
  }

  /**
   * Filter layers by triage scores, returning those above threshold.
   */
  filterRelevantLayers(
    layers: SelfKnowledgeLayer[],
    scores: Record<string, number>,
  ): SelfKnowledgeLayer[] {
    return layers.filter(l => (scores[l.id] ?? 0) >= this.threshold);
  }

  private async llmTriage(query: string, layers: SelfKnowledgeLayer[]): Promise<TriageResult> {
    const start = Date.now();

    const layerDescriptions = layers
      .map(l => `- ${l.id}: ${l.description}`)
      .join('\n');

    const prompt = `Given an agent self-knowledge query: "${query}"

Which self-knowledge layers are relevant? Score each 0.0-1.0:
${layerDescriptions}

Return ONLY valid JSON, no explanation: {"${layers.map(l => l.id).join('": 0.0, "')}": 0.0}`;

    const response = await this.intelligence!.evaluate(prompt, {
      model: 'fast',
      maxTokens: 200,
      temperature: 0,
    });

    const scores = this.parseTriageResponse(response, layers.map(l => l.id));

    return {
      scores,
      mode: 'llm',
      elapsedMs: Date.now() - start,
    };
  }

  private parseTriageResponse(response: string, layerIds: string[]): Record<string, number> {
    // Extract JSON from response (may contain extra text)
    const jsonMatch = response.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      throw new Error(`Triage response contained no JSON: ${response.slice(0, 200)}`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error(`Invalid JSON in triage response: ${jsonMatch[0].slice(0, 200)}`);
    }

    // Validate and clamp scores
    const scores: Record<string, number> = {};
    for (const id of layerIds) {
      const raw = parsed[id];
      if (typeof raw === 'number' && !isNaN(raw)) {
        scores[id] = Math.max(0, Math.min(1, raw));
      } else {
        scores[id] = 0;
      }
    }

    return scores;
  }

  private ruleBasedTriage(
    query: string,
    layerIds: string[],
    startTime: number,
  ): TriageResult {
    const lower = query.toLowerCase();
    const scores: Record<string, number> = {};

    for (const id of layerIds) {
      const keywords = LAYER_KEYWORDS[id] ?? [];
      const matches = keywords.filter(kw => lower.includes(kw)).length;
      // Score proportional to keyword matches, capped at 1.0
      scores[id] = Math.min(1, matches * 0.3);
    }

    // If no keywords matched anything, give identity a baseline
    const hasAnyMatch = Object.values(scores).some(s => s >= this.threshold);
    if (!hasAnyMatch) {
      scores['identity'] = 0.5;
    }

    return {
      scores,
      mode: 'rule-based',
      elapsedMs: Date.now() - startTime,
    };
  }
}
