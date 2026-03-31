/**
 * CopilotCliIntelligenceProvider — GitHub Copilot CLI-backed IntelligenceProvider.
 *
 * This is intentionally limited to non-interactive prompt evaluation for now.
 * The persistent tmux/session runtime for Betty should use Copilot CLI's ACP
 * server on a machine where the CLI is installed and authenticated.
 */

import type { IntelligenceOptions, IntelligenceProvider } from './types.js';
import { runCopilotPrompt } from './CopilotCli.js';

const DEFAULT_MODEL = 'fast';

export class CopilotCliIntelligenceProvider implements IntelligenceProvider {
  private copilotPath: string;
  private cwd: string;

  constructor(copilotPath: string, cwd: string) {
    this.copilotPath = copilotPath;
    this.cwd = cwd;
  }

  async evaluate(prompt: string, options?: IntelligenceOptions): Promise<string> {
    const result = await runCopilotPrompt({
      copilotPath: this.copilotPath,
      cwd: this.cwd,
      prompt,
      model: options?.model ?? DEFAULT_MODEL,
      timeoutMs: 2 * 60 * 1000,
    });

    return result.text.trim();
  }
}
