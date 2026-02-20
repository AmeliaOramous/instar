/**
 * Unit tests for DispatchManager.
 *
 * Covers: URL validation, polling, local storage, dedup,
 * context generation, apply/mark, edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DispatchManager } from '../../src/core/DispatchManager.js';
import type { Dispatch } from '../../src/core/DispatchManager.js';

describe('DispatchManager URL validation', () => {
  it('rejects HTTP URLs', () => {
    expect(() => new DispatchManager({
      enabled: true,
      dispatchUrl: 'http://example.com/dispatches',
      dispatchFile: '/tmp/test.json',
    })).toThrow('HTTPS');
  });

  it('rejects localhost URLs', () => {
    expect(() => new DispatchManager({
      enabled: true,
      dispatchUrl: 'https://localhost/dispatches',
      dispatchFile: '/tmp/test.json',
    })).toThrow('internal');
  });

  it('rejects 127.0.0.1 URLs', () => {
    expect(() => new DispatchManager({
      enabled: true,
      dispatchUrl: 'https://127.0.0.1/dispatches',
      dispatchFile: '/tmp/test.json',
    })).toThrow('internal');
  });

  it('rejects 192.168.x.x URLs', () => {
    expect(() => new DispatchManager({
      enabled: true,
      dispatchUrl: 'https://192.168.1.1/dispatches',
      dispatchFile: '/tmp/test.json',
    })).toThrow('internal');
  });

  it('accepts valid HTTPS URLs', () => {
    expect(() => new DispatchManager({
      enabled: true,
      dispatchUrl: 'https://dawn.bot-me.ai/api/instar/dispatches',
      dispatchFile: '/tmp/test.json',
    })).not.toThrow();
  });

  it('rejects invalid URLs', () => {
    expect(() => new DispatchManager({
      enabled: true,
      dispatchUrl: 'not-a-url',
      dispatchFile: '/tmp/test.json',
    })).toThrow('invalid');
  });
});

describe('DispatchManager local storage', () => {
  let tmpDir: string;
  let dispatchFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instar-dispatch-'));
    dispatchFile = path.join(tmpDir, 'dispatches.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty list when no dispatches exist', () => {
    const manager = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    expect(manager.list()).toEqual([]);
    expect(manager.pending()).toEqual([]);
  });

  it('returns null for non-existent dispatch', () => {
    const manager = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    expect(manager.get('dsp-nonexistent')).toBeNull();
  });

  it('handles corrupted dispatch file', () => {
    fs.writeFileSync(dispatchFile, 'bad json {{');
    const manager = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    expect(manager.list()).toEqual([]);
  });

  it('marks dispatch as applied', () => {
    const dispatches: Dispatch[] = [{
      dispatchId: 'dsp-test1',
      type: 'strategy',
      title: 'Test Strategy',
      content: 'Try approach X for better results.',
      priority: 'normal',
      createdAt: '2026-01-01T00:00:00Z',
      receivedAt: '2026-01-01T01:00:00Z',
      applied: false,
    }];
    fs.writeFileSync(dispatchFile, JSON.stringify(dispatches));

    const manager = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    expect(manager.pending()).toHaveLength(1);

    const result = manager.markApplied('dsp-test1');
    expect(result).toBe(true);
    expect(manager.pending()).toHaveLength(0);
    expect(manager.list()[0].applied).toBe(true);
  });

  it('returns false when marking non-existent dispatch', () => {
    const manager = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    expect(manager.markApplied('dsp-nonexistent')).toBe(false);
  });

  it('persists applied state to disk', () => {
    const dispatches: Dispatch[] = [{
      dispatchId: 'dsp-persist',
      type: 'lesson',
      title: 'Persistence Test',
      content: 'This should persist.',
      priority: 'high',
      createdAt: '2026-01-01T00:00:00Z',
      receivedAt: '2026-01-01T01:00:00Z',
      applied: false,
    }];
    fs.writeFileSync(dispatchFile, JSON.stringify(dispatches));

    const manager1 = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    manager1.markApplied('dsp-persist');

    // Create new manager from same file
    const manager2 = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    expect(manager2.get('dsp-persist')?.applied).toBe(true);
    expect(manager2.pending()).toHaveLength(0);
  });
});

describe('DispatchManager context generation', () => {
  let tmpDir: string;
  let dispatchFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instar-dispatch-ctx-'));
    dispatchFile = path.join(tmpDir, 'dispatches.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty string when no pending dispatches', () => {
    const manager = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    expect(manager.generateContext()).toBe('');
  });

  it('generates context with pending dispatches', () => {
    const dispatches: Dispatch[] = [
      {
        dispatchId: 'dsp-ctx1',
        type: 'strategy',
        title: 'Better Memory Handling',
        content: 'When users ask about past conversations, check MEMORY.md first before claiming no memory.',
        priority: 'high',
        createdAt: '2026-01-01T00:00:00Z',
        receivedAt: '2026-01-01T01:00:00Z',
        applied: false,
      },
      {
        dispatchId: 'dsp-ctx2',
        type: 'behavioral',
        title: 'Reduce Verbosity',
        content: 'Health check reports should be concise — one line per component.',
        priority: 'normal',
        createdAt: '2026-01-02T00:00:00Z',
        receivedAt: '2026-01-02T01:00:00Z',
        applied: false,
      },
    ];
    fs.writeFileSync(dispatchFile, JSON.stringify(dispatches));

    const manager = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    const context = manager.generateContext();
    expect(context).toContain('Intelligence Dispatches');
    expect(context).toContain('Better Memory Handling');
    expect(context).toContain('[HIGH]');
    expect(context).toContain('Reduce Verbosity');
    expect(context).toContain('2 pending dispatches');
  });

  it('excludes applied dispatches from context', () => {
    const dispatches: Dispatch[] = [
      {
        dispatchId: 'dsp-applied',
        type: 'lesson',
        title: 'Already Applied',
        content: 'This was already applied.',
        priority: 'normal',
        createdAt: '2026-01-01T00:00:00Z',
        receivedAt: '2026-01-01T01:00:00Z',
        applied: true,
      },
    ];
    fs.writeFileSync(dispatchFile, JSON.stringify(dispatches));

    const manager = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    expect(manager.generateContext()).toBe('');
  });

  it('sorts by priority (critical first)', () => {
    const dispatches: Dispatch[] = [
      {
        dispatchId: 'dsp-low',
        type: 'configuration',
        title: 'Low Priority',
        content: 'Optional config change.',
        priority: 'low',
        createdAt: '2026-01-01T00:00:00Z',
        receivedAt: '2026-01-01T01:00:00Z',
        applied: false,
      },
      {
        dispatchId: 'dsp-critical',
        type: 'security',
        title: 'Critical Security',
        content: 'New injection pattern detected.',
        priority: 'critical',
        createdAt: '2026-01-02T00:00:00Z',
        receivedAt: '2026-01-02T01:00:00Z',
        applied: false,
      },
    ];
    fs.writeFileSync(dispatchFile, JSON.stringify(dispatches));

    const manager = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    const context = manager.generateContext();
    const criticalPos = context.indexOf('Critical Security');
    const lowPos = context.indexOf('Low Priority');
    expect(criticalPos).toBeLessThan(lowPos);
  });
});

describe('DispatchManager polling', () => {
  let tmpDir: string;
  let dispatchFile: string;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instar-dispatch-poll-'));
    dispatchFile = path.join(tmpDir, 'dispatches.json');
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty result when disabled', async () => {
    const manager = new DispatchManager({
      enabled: false,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
    });

    const result = await manager.check();
    expect(result.newCount).toBe(0);
    expect(result.dispatches).toEqual([]);
  });

  it('fetches and stores new dispatches', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dispatches: [
          {
            dispatchId: 'dsp-new1',
            type: 'strategy',
            title: 'New Strategy',
            content: 'Try this approach.',
            priority: 'normal',
            createdAt: '2026-02-20T00:00:00Z',
          },
        ],
        count: 1,
        asOf: '2026-02-20T12:00:00Z',
      }),
    });

    const manager = new DispatchManager({
      enabled: true,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
      version: '0.1.12',
    });

    const result = await manager.check();
    expect(result.newCount).toBe(1);
    expect(result.dispatches[0].dispatchId).toBe('dsp-new1');
    expect(result.dispatches[0].receivedAt).toBeTruthy();
    expect(result.dispatches[0].applied).toBe(false);

    // Verify stored locally
    expect(manager.list()).toHaveLength(1);
    expect(manager.get('dsp-new1')).not.toBeNull();
  });

  it('sends proper identification headers', async () => {
    let capturedHeaders: Record<string, string> = {};

    global.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
      capturedHeaders = opts.headers;
      return {
        ok: true,
        json: async () => ({ dispatches: [], count: 0, asOf: new Date().toISOString() }),
      };
    });

    const manager = new DispatchManager({
      enabled: true,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
      version: '0.1.12',
    });

    await manager.check();

    expect(capturedHeaders['User-Agent']).toMatch(/^instar\/0\.1\.12/);
    expect(capturedHeaders['X-Instar-Version']).toBe('0.1.12');
    expect(capturedHeaders['Accept']).toBe('application/json');
  });

  it('deduplicates dispatches already received', async () => {
    // Pre-populate with existing dispatch
    const existing: Dispatch[] = [{
      dispatchId: 'dsp-existing',
      type: 'lesson',
      title: 'Already Have This',
      content: 'Old dispatch.',
      priority: 'normal',
      createdAt: '2026-01-01T00:00:00Z',
      receivedAt: '2026-01-01T01:00:00Z',
      applied: true,
    }];
    fs.writeFileSync(dispatchFile, JSON.stringify(existing));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dispatches: [
          {
            dispatchId: 'dsp-existing', // Same ID — should be deduped
            type: 'lesson',
            title: 'Already Have This',
            content: 'Old dispatch.',
            priority: 'normal',
            createdAt: '2026-01-01T00:00:00Z',
          },
          {
            dispatchId: 'dsp-new2',
            type: 'behavioral',
            title: 'Actually New',
            content: 'New guidance.',
            priority: 'high',
            createdAt: '2026-02-20T00:00:00Z',
          },
        ],
        count: 2,
        asOf: '2026-02-20T12:00:00Z',
      }),
    });

    const manager = new DispatchManager({
      enabled: true,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
      version: '0.1.12',
    });

    const result = await manager.check();
    expect(result.newCount).toBe(1); // Only the new one
    expect(result.dispatches[0].dispatchId).toBe('dsp-new2');
    expect(manager.list()).toHaveLength(2); // 1 existing + 1 new
  });

  it('handles server errors gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const manager = new DispatchManager({
      enabled: true,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
      version: '0.1.12',
    });

    const result = await manager.check();
    expect(result.newCount).toBe(0);
    expect(result.error).toContain('500');
  });

  it('handles network errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network unreachable'));

    const manager = new DispatchManager({
      enabled: true,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
      version: '0.1.12',
    });

    const result = await manager.check();
    expect(result.newCount).toBe(0);
    expect(result.error).toContain('Network unreachable');
  });

  it('sends since parameter on subsequent checks', async () => {
    let capturedUrl = '';

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({ dispatches: [], count: 0, asOf: new Date().toISOString() }),
      };
    });

    const manager = new DispatchManager({
      enabled: true,
      dispatchUrl: 'https://example.com/dispatches',
      dispatchFile,
      version: '0.1.12',
    });

    // First check — no since parameter
    await manager.check();
    expect(capturedUrl).not.toContain('since=');

    // Second check — should include since parameter
    await manager.check();
    expect(capturedUrl).toContain('since=');
  });
});
