/**
 * CodexCliIntelligenceProvider — OpenAI/Codex-backed IntelligenceProvider.
 *
 * Uses `codex exec` for non-interactive judgments. This gives InstarGPT a
 * GPT-native path for classification, reflection, and other internal calls
 * while preserving the same IntelligenceProvider contract used elsewhere.
 */

import type { IntelligenceProvider, IntelligenceOptions } from './types.js';
import { runCodexPrompt } from './CodexCli.js';

const DEFAULT_MODEL = 'fast';

export class CodexCliIntelligenceProvider implements IntelligenceProvider {
  private codexPath: string;
  private cwd: string;

  constructor(codexPath: string, cwd: string) {
    this.codexPath = codexPath;
    this.cwd = cwd;
  }

  async evaluate(prompt: string, options?: IntelligenceOptions): Promise<string> {
    const result = await runCodexPrompt({
      codexPath: this.codexPath,
      cwd: this.cwd,
      prompt,
      model: options?.model ?? DEFAULT_MODEL,
      timeoutMs: 2 * 60 * 1000,
    });

    return result.text.trim();
  }
}
