import { describe, it, expect, beforeEach } from 'vitest';
import { ProbeRegistry, ProbeTimeoutError, ProbeExecutionError } from '../../src/knowledge/ProbeRegistry.js';

describe('ProbeRegistry', () => {
  let registry: ProbeRegistry;

  beforeEach(() => {
    registry = new ProbeRegistry();
  });

  // Gate Test 1.9: Rejects unregistered probe names
  it('rejects unregistered probe names', async () => {
    await expect(registry.execute('evil-probe')).rejects.toThrow('not registered');
  });

  // Gate Test 1.10: Enforces timeout on slow probes
  it('enforces timeout on slow probes', async () => {
    registry.register(
      'slow-probe',
      async () => {
        await new Promise(resolve => setTimeout(resolve, 10_000));
        return { content: 'never reached', truncated: false, elapsedMs: 0 };
      },
      { timeoutMs: 100 }, // Short timeout for test speed
    );

    await expect(registry.execute('slow-probe')).rejects.toThrow(ProbeTimeoutError);
  }, 5_000);

  // Gate Test 1.11: Enforces output cap (2000 chars)
  it('enforces output cap', async () => {
    const longContent = 'x'.repeat(10_000);
    registry.register('big-probe', async () => ({
      content: longContent,
      truncated: false,
      elapsedMs: 1,
    }));

    const result = await registry.execute('big-probe');
    expect(result.content.length).toBeLessThanOrEqual(2_000);
    expect(result.truncated).toBe(true);
  });

  it('returns content from registered probe', async () => {
    registry.register('test-probe', async () => ({
      content: 'hello from probe',
      truncated: false,
      elapsedMs: 1,
    }));

    const result = await registry.execute('test-probe');
    expect(result.content).toBe('hello from probe');
    expect(result.truncated).toBe(false);
  });

  it('passes args to probe function', async () => {
    registry.register('echo-probe', async (args) => ({
      content: JSON.stringify(args),
      truncated: false,
      elapsedMs: 1,
    }));

    const result = await registry.execute('echo-probe', { key: 'value' });
    expect(JSON.parse(result.content)).toEqual({ key: 'value' });
  });

  it('lists registered probes', () => {
    registry.register('probe-a', async () => ({ content: '', truncated: false, elapsedMs: 0 }));
    registry.register('probe-b', async () => ({ content: '', truncated: false, elapsedMs: 0 }));
    expect(registry.list()).toEqual(['probe-a', 'probe-b']);
  });

  it('has() returns correct boolean', () => {
    registry.register('exists', async () => ({ content: '', truncated: false, elapsedMs: 0 }));
    expect(registry.has('exists')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('wraps probe errors in ProbeExecutionError', async () => {
    registry.register('error-probe', async () => {
      throw new Error('kaboom');
    });

    await expect(registry.execute('error-probe')).rejects.toThrow(ProbeExecutionError);
  });
});
