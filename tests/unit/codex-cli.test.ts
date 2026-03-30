import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

import { runCodexPrompt } from '../../src/core/CodexCli.js';

describe('runCodexPrompt', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instar-codex-cli-'));
    execFileMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('falls back to gpt-5 when gpt-5-mini is unsupported for a ChatGPT Codex account', async () => {
    execFileMock
      .mockImplementationOnce((_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
        if (typeof _opts === 'function') {
          cb = _opts as (err: Error | null, result: { stdout: string; stderr: string }) => void;
        }
        const error = new Error('Command failed');
        const stdout = [
          JSON.stringify({ type: 'thread.started', thread_id: 'thread-fast' }),
          JSON.stringify({ type: 'turn.started' }),
          JSON.stringify({
            type: 'error',
            message: '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-5-mini\' model is not supported when using Codex with a ChatGPT account."}}',
          }),
          JSON.stringify({
            type: 'turn.failed',
            error: {
              message: '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-5-mini\' model is not supported when using Codex with a ChatGPT account."}}',
            },
          }),
        ].join('\n');
        Object.assign(error, {
          stdout,
          stderr: '',
        });
        cb?.(error, { stdout, stderr: '' });
      })
      .mockImplementationOnce((_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
        if (typeof _opts === 'function') {
          cb = _opts as (err: Error | null, result: { stdout: string; stderr: string }) => void;
        }
        const outputPath = args[args.indexOf('-o') + 1];
        fs.writeFileSync(outputPath, 'ok\n');
        cb?.(null, {
          stdout: [
            JSON.stringify({ type: 'thread.started', thread_id: 'thread-fast' }),
            JSON.stringify({ type: 'turn.started' }),
            JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }),
            JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 12, cached_input_tokens: 0, output_tokens: 3 } }),
          ].join('\n'),
          stderr: '',
        });
      });

    const result = await runCodexPrompt({
      codexPath: '/usr/bin/codex',
      cwd: tmpDir,
      prompt: 'Return only ok.',
      model: 'fast',
    });

    expect(result.text).toBe('ok');
    expect(result.model).toBe('gpt-5');
    expect(execFileMock).toHaveBeenCalledTimes(2);

    const firstArgs = execFileMock.mock.calls[0][1] as string[];
    const secondArgs = execFileMock.mock.calls[1][1] as string[];
    expect(firstArgs[firstArgs.indexOf('-m') + 1]).toBe('gpt-5-mini');
    expect(secondArgs[secondArgs.indexOf('-m') + 1]).toBe('gpt-5');
  });
});
