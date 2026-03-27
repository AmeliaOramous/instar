/**
 * CodexCliIntelligenceProvider — IntelligenceProvider backed by Codex CLI.
 *
 * Uses `codex exec` in read-only mode for lightweight judgment calls, so
 * Codex-backed agents can still use reflection, summaries, and other internal
 * reasoning features without requiring an API key.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IntelligenceOptions, IntelligenceProvider } from './types.js';

const DEFAULT_MODEL = 'balanced';
const DEFAULT_TIMEOUT_MS = 45_000;

function resolveCodexModel(tierOrModel: string): string {
  const key = tierOrModel.toLowerCase();
  const map: Record<string, string> = {
    fast: 'gpt-5-codex-mini',
    balanced: 'gpt-5-codex',
    capable: 'gpt-5.4',
  };
  return map[key] ?? tierOrModel;
}

export class CodexCliIntelligenceProvider implements IntelligenceProvider {
  private runtimePath: string;
  private runtimeHome?: string;

  constructor(runtimePath: string, runtimeHome?: string) {
    this.runtimePath = runtimePath;
    this.runtimeHome = runtimeHome;
  }

  async evaluate(prompt: string, options?: IntelligenceOptions): Promise<string> {
    const model = resolveCodexModel(options?.model ?? DEFAULT_MODEL);
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instar-codex-intel-'));
    const outputPath = path.join(outputDir, 'last-message.txt');

    return new Promise((resolve, reject) => {
      const args = [
        'exec',
        '--ask-for-approval', 'never',
        '--sandbox', 'read-only',
        '--skip-git-repo-check',
        '--model', model,
        '--output-last-message', outputPath,
        '-',
      ];

      const childEnv = { ...process.env };
      if (this.runtimeHome) {
        childEnv.CODEX_HOME = this.runtimeHome;
      }

      const child = execFile(this.runtimePath, args, {
        timeout: DEFAULT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: childEnv,
      }, (error, stdout, stderr) => {
        try {
          const finalMessage = fs.existsSync(outputPath)
            ? fs.readFileSync(outputPath, 'utf-8').trim()
            : stdout.trim();

          if (error) {
            reject(new Error(`Codex CLI error: ${error.message}${stderr ? ` — ${stderr.slice(0, 200)}` : ''}`));
            return;
          }

          resolve(finalMessage);
        } finally {
          try {
            fs.rmSync(outputDir, { recursive: true, force: true });
          } catch {
            // @silent-fallback-ok — temp cleanup best effort
          }
        }
      });

      child.stdin?.end(prompt);
    });
  }
}
