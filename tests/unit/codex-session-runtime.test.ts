import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mockTmuxSessions = new Set<string>();
const capturedExecFileSyncCalls: Array<{ cmd: string; args: string[] }> = [];

vi.mock('node:child_process', () => {
  return {
    execFileSync: vi.fn().mockImplementation((cmd: string, args?: string[]) => {
      if (!args) return '';

      capturedExecFileSyncCalls.push({ cmd, args: [...args] });

      if (args[0] === 'has-session') {
        const target = args[2]?.replace(/^=/, '');
        if (!mockTmuxSessions.has(target)) {
          throw new Error(`session not found: ${target}`);
        }
        return '';
      }

      if (args[0] === 'new-session') {
        const sIdx = args.indexOf('-s');
        if (sIdx >= 0 && args[sIdx + 1]) {
          mockTmuxSessions.add(args[sIdx + 1]);
        }
        return '';
      }

      if (args[0] === 'kill-session') {
        const target = args[2]?.replace(/^=/, '');
        mockTmuxSessions.delete(target);
        return '';
      }

      if (args[0] === 'display-message') {
        return 'node||node';
      }

      if (args[0] === 'capture-pane') {
        return 'INSTAR_CODEX_READY\n';
      }

      if (args[0] === 'send-keys') {
        return '';
      }

      return '';
    }),
    execFile: vi.fn().mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string }) => void) => {
        if (typeof _opts === 'function') {
          cb = _opts as (err: Error | null, result: { stdout: string }) => void;
        }
        if (args[0] === 'has-session') {
          const target = args[2]?.replace(/^=/, '');
          if (!mockTmuxSessions.has(target)) {
            if (cb) cb(new Error(`session not found: ${target}`), { stdout: '' });
          } else if (cb) {
            cb(null, { stdout: '' });
          }
        } else if (cb) {
          cb(null, { stdout: '' });
        }
      },
    ),
  };
});

import { SessionManager } from '../../src/core/SessionManager.js';
import { StateManager } from '../../src/core/StateManager.js';
import type { SessionManagerConfig } from '../../src/core/types.js';

function findLastNewSessionCall(): string[] | undefined {
  const calls = capturedExecFileSyncCalls.filter((call) => call.args[0] === 'new-session');
  return calls[calls.length - 1]?.args;
}

describe('SessionManager Codex runtime', () => {
  let tmpDir: string;
  let stateDir: string;
  let state: StateManager;
  let config: SessionManagerConfig;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instar-codex-runtime-'));
    stateDir = path.join(tmpDir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });

    state = new StateManager(stateDir);
    config = {
      runtime: 'codex-cli',
      tmuxPath: '/usr/bin/tmux',
      codexPath: '/usr/bin/codex',
      projectDir: tmpDir,
      maxSessions: 3,
      protectedSessions: [],
      completionPatterns: ['Session complete'],
      codexSandboxMode: 'danger-full-access',
    };
    manager = new SessionManager(config, state);

    mockTmuxSessions.clear();
    capturedExecFileSyncCalls.length = 0;
  });

  afterEach(() => {
    manager.stopMonitoring();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('spawns interactive sessions through the Codex worker and passes resume state', async () => {
    const resumeSessionId = 'thread_interactive_123';
    await manager.spawnInteractiveSession(undefined, 'codex-chat', {
      telegramTopicId: 42,
      resumeSessionId,
    });

    const args = findLastNewSessionCall();
    expect(args).toBeDefined();
    expect(args).toContain(process.execPath);
    expect(args!.some((arg) => arg.endsWith('/runtime/CodexSessionWorker.js'))).toBe(true);
    expect(args).toContain('--codex-path');
    expect(args![args!.indexOf('--codex-path') + 1]).toBe('/usr/bin/codex');
    expect(args).toContain('--sandbox');
    expect(args![args!.indexOf('--sandbox') + 1]).toBe('danger-full-access');
    expect(args).toContain('--resume-session');
    expect(args![args!.indexOf('--resume-session') + 1]).toBe(resumeSessionId);
    expect(args).toContain('INSTAR_TELEGRAM_TOPIC=42');
  });

  it('spawns triage sessions in read-only sandbox for Codex runtime', async () => {
    const resumeSessionId = 'thread_triage_456';
    const tmuxSession = await manager.spawnTriageSession('triage-investigation', {
      allowedTools: ['Read', 'Glob', 'Grep'],
      permissionMode: 'dontAsk',
      resumeSessionId,
    });

    const args = findLastNewSessionCall();
    expect(tmuxSession).toContain('triage-investigation');
    expect(args).toBeDefined();
    expect(args).toContain(process.execPath);
    expect(args).toContain('--sandbox');
    expect(args![args!.indexOf('--sandbox') + 1]).toBe('read-only');
    expect(args).not.toContain('--allowedTools');
    expect(args).not.toContain('--permission-mode');
    expect(args).toContain('--resume-session');
    expect(args![args!.indexOf('--resume-session') + 1]).toBe(resumeSessionId);

    const saved = state.listSessions({ status: 'running' }).find((session) => session.tmuxSession === tmuxSession);
    expect(saved?.runtime).toBe('codex-cli');
    expect(saved?.runtimeSessionId).toBe(resumeSessionId);
  });

  it('hydrates runtime session IDs from Codex worker state files', () => {
    state.saveSession({
      id: 'session-1',
      name: 'codex-chat',
      status: 'running',
      tmuxSession: 'tmux-codex-1',
      startedAt: new Date().toISOString(),
      runtime: 'codex-cli',
    });

    const workerStatePath = path.join(tmpDir, '.instar', 'state', 'codex-sessions', 'tmux-codex-1.json');
    fs.mkdirSync(path.dirname(workerStatePath), { recursive: true });
    fs.writeFileSync(workerStatePath, JSON.stringify({ sessionId: 'thread_from_worker' }));

    const runtimeSessionId = manager.getRuntimeSessionIdForTmuxSession('tmux-codex-1');
    expect(runtimeSessionId).toBe('thread_from_worker');
    expect(state.getSession('session-1')?.runtimeSessionId).toBe('thread_from_worker');
  });
});
