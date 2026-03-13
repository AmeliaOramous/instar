import { describe, it, expect, vi } from 'vitest';
import { TreeTriage } from '../../src/knowledge/TreeTriage.js';
import type { SelfKnowledgeLayer } from '../../src/knowledge/types.js';

const MOCK_LAYERS: SelfKnowledgeLayer[] = [
  { id: 'identity', name: 'Identity', description: 'Who the agent is, values, voice, relationships', children: [] },
  { id: 'experience', name: 'Experience', description: 'What the agent has learned, knowledge, decisions', children: [] },
  { id: 'capabilities', name: 'Capabilities', description: 'What the agent can do, tools, platforms, limits', children: [] },
  { id: 'state', name: 'State', description: 'Current operational state, running jobs, health', children: [] },
  { id: 'evolution', name: 'Evolution', description: 'Growth trajectory, improvement patterns, goals', children: [] },
];

describe('TreeTriage', () => {
  // Gate Test 1.7: Triage fallback activates when LLM unavailable
  it('falls back to rule-based when no intelligence provider', async () => {
    const triage = new TreeTriage(null);
    const result = await triage.triage('who am I?', MOCK_LAYERS);
    expect(result.mode).toBe('rule-based');
    expect(result.scores).toBeDefined();
  });

  it('falls back to rule-based when intelligence provider throws', async () => {
    const mockIntelligence = {
      evaluate: vi.fn().mockRejectedValue(new Error('LLM down')),
    };
    const triage = new TreeTriage(mockIntelligence);
    const result = await triage.triage('who am I?', MOCK_LAYERS);
    expect(result.mode).toBe('rule-based');
  });

  // Gate Test 1.8: Triage fallback keyword matching
  describe('rule-based fallback', () => {
    const triage = new TreeTriage(null);

    it('routes "who am I?" to identity layer', async () => {
      const result = await triage.triage('who am I?', MOCK_LAYERS);
      expect(result.scores['identity']).toBeGreaterThanOrEqual(0.3);
    });

    it('routes "what can I do?" to capabilities layer', async () => {
      const result = await triage.triage('what can I do?', MOCK_LAYERS);
      expect(result.scores['capabilities']).toBeGreaterThanOrEqual(0.3);
    });

    it('routes "how am I growing?" to evolution layer', async () => {
      const result = await triage.triage('how am I growing?', MOCK_LAYERS);
      expect(result.scores['evolution']).toBeGreaterThanOrEqual(0.3);
    });

    it('routes "what jobs are running?" to state layer', async () => {
      const result = await triage.triage('what jobs are running?', MOCK_LAYERS);
      expect(result.scores['state']).toBeGreaterThanOrEqual(0.3);
    });

    it('routes "what have I learned?" to experience layer', async () => {
      const result = await triage.triage('what have I learned?', MOCK_LAYERS);
      expect(result.scores['experience']).toBeGreaterThanOrEqual(0.3);
    });

    it('gives identity baseline for unknown queries', async () => {
      const result = await triage.triage('xyzzy foobar', MOCK_LAYERS);
      expect(result.scores['identity']).toBeGreaterThanOrEqual(0.4);
    });
  });

  // Gate Test 1.4/1.5/1.6: LLM triage routing (mocked)
  describe('LLM triage', () => {
    it('routes "who am I?" to identity layer via LLM', async () => {
      const mockIntelligence = {
        evaluate: vi.fn().mockResolvedValue('{"identity": 0.9, "experience": 0.2, "capabilities": 0.1, "state": 0.0, "evolution": 0.1}'),
      };
      const triage = new TreeTriage(mockIntelligence);
      const result = await triage.triage('who am I?', MOCK_LAYERS);
      expect(result.mode).toBe('llm');
      expect(result.scores['identity']).toBeGreaterThanOrEqual(0.6);
      expect(result.scores['state']).toBeLessThanOrEqual(0.3);
    });

    it('routes "what jobs are running?" to state layer via LLM', async () => {
      const mockIntelligence = {
        evaluate: vi.fn().mockResolvedValue('{"identity": 0.1, "experience": 0.0, "capabilities": 0.2, "state": 0.9, "evolution": 0.0}'),
      };
      const triage = new TreeTriage(mockIntelligence);
      const result = await triage.triage('what jobs are running?', MOCK_LAYERS);
      expect(result.mode).toBe('llm');
      expect(result.scores['state']).toBeGreaterThanOrEqual(0.6);
      expect(result.scores['identity']).toBeLessThanOrEqual(0.3);
    });

    it('handles malformed LLM JSON gracefully', async () => {
      const mockIntelligence = {
        evaluate: vi.fn().mockResolvedValue('Here is some text without JSON'),
      };
      const triage = new TreeTriage(mockIntelligence);
      // Should fall back to rule-based
      const result = await triage.triage('who am I?', MOCK_LAYERS);
      expect(result.mode).toBe('rule-based');
    });

    it('clamps scores to 0-1 range', async () => {
      const mockIntelligence = {
        evaluate: vi.fn().mockResolvedValue('{"identity": 5.0, "experience": -1.0, "capabilities": 0.5, "state": 0.3, "evolution": 0.1}'),
      };
      const triage = new TreeTriage(mockIntelligence);
      const result = await triage.triage('test', MOCK_LAYERS);
      expect(result.scores['identity']).toBeLessThanOrEqual(1);
      expect(result.scores['experience']).toBeGreaterThanOrEqual(0);
    });
  });

  describe('filterRelevantLayers', () => {
    const triage = new TreeTriage(null);

    it('filters layers above threshold', () => {
      const scores = { identity: 0.9, experience: 0.2, capabilities: 0.5, state: 0.1, evolution: 0.4 };
      const relevant = triage.filterRelevantLayers(MOCK_LAYERS, scores);
      const relevantIds = relevant.map(l => l.id);
      expect(relevantIds).toContain('identity');
      expect(relevantIds).toContain('capabilities');
      expect(relevantIds).toContain('evolution');
      expect(relevantIds).not.toContain('experience');
      expect(relevantIds).not.toContain('state');
    });
  });
});
