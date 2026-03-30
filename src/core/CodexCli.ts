import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { estimateUsdFromTokens, type TokenUsage } from './CostAwareness.js';
import type { ModelTier, SessionManagerConfig } from './types.js';
import { resolveCodexModel } from './models.js';

const execFileAsync = promisify(execFile);

type SandboxMode = NonNullable<SessionManagerConfig['codexSandboxMode']>;

const DEFAULT_SANDBOX_MODE: SandboxMode = 'danger-full-access';

interface CodexEvent {
  type?: string;
  message?: string;
  thread_id?: string;
  item?: {
    type?: string;
    text?: string;
  };
  error?: {
    message?: string;
  };
}

export interface RunCodexPromptOptions {
  codexPath: string;
  cwd: string;
  prompt: string;
  model?: string;
  modelMap?: Partial<Record<ModelTier, string>>;
  sandboxMode?: SandboxMode;
  resumeSessionId?: string;
  timeoutMs?: number;
}

export interface RunCodexPromptResult {
  sessionId: string | null;
  text: string;
  model: string;
  usage: TokenUsage | null;
  estimatedCostUsd: number | null;
  events: CodexEvent[];
}

function resolvePreferredCodexModel(
  requestedModel: string | undefined,
  modelMap?: Partial<Record<ModelTier, string>>,
): string {
  const resolved = resolveCodexModel(requestedModel ?? 'fast');

  switch ((requestedModel ?? 'fast').toLowerCase()) {
    case 'haiku':
    case 'fast':
      return modelMap?.haiku ?? resolved;
    case 'sonnet':
    case 'balanced':
      return modelMap?.sonnet ?? resolved;
    case 'opus':
    case 'capable':
      return modelMap?.opus ?? resolved;
    default:
      return resolved;
  }
}

function buildModelCandidates(
  requestedModel: string | undefined,
  modelMap?: Partial<Record<ModelTier, string>>,
): string[] {
  const primary = resolvePreferredCodexModel(requestedModel, modelMap);
  const candidates = [primary];

  // ChatGPT-backed Codex accounts do not always expose gpt-5-mini.
  if (primary === 'gpt-5-mini') {
    candidates.push(modelMap?.sonnet ?? 'gpt-5');
  }

  if (primary === 'gpt-5.4') {
    candidates.push(modelMap?.sonnet ?? 'gpt-5');
  }

  return [...new Set(candidates.filter(Boolean))];
}

function parseCodexEvents(stdout: string): CodexEvent[] {
  const events: CodexEvent[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as CodexEvent);
    } catch {
      events.push({ type: 'raw', message: trimmed });
    }
  }
  return events;
}

function isUnsupportedModelError(events: CodexEvent[]): boolean {
  return events.some((event) => {
    const text = event.message ?? event.error?.message ?? '';
    return text.includes('model is not supported')
      || text.includes('is not supported when using Codex with a ChatGPT account');
  });
}

function eventError(events: CodexEvent[]): string | null {
  for (const event of events) {
    const text = event.message ?? event.error?.message;
    if ((event.type === 'error' || event.type === 'turn.failed') && text) {
      return text;
    }
  }
  return null;
}

function latestAgentMessage(events: CodexEvent[]): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
      return event.item.text;
    }
  }
  return '';
}

function extractUsage(events: CodexEvent[]): TokenUsage | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i] as CodexEvent & {
      usage?: {
        input_tokens?: number;
        cached_input_tokens?: number;
        output_tokens?: number;
      };
    };
    if (event.type === 'turn.completed' && event.usage) {
      return {
        inputTokens: event.usage.input_tokens ?? 0,
        cachedInputTokens: event.usage.cached_input_tokens ?? 0,
        outputTokens: event.usage.output_tokens ?? 0,
      };
    }
  }
  return null;
}

export async function runCodexPrompt(options: RunCodexPromptOptions): Promise<RunCodexPromptResult> {
  const sandboxMode = options.sandboxMode ?? DEFAULT_SANDBOX_MODE;
  const candidates = buildModelCandidates(options.model, options.modelMap);
  let lastError = 'Codex did not produce a response';

  for (const candidate of candidates) {
    const outputPath = path.join(
      os.tmpdir(),
      `instargpt-codex-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
    );

    const baseArgs = [
      'exec',
      '--color', 'never',
      '--json',
      '-o', outputPath,
      '-C', options.cwd,
      '-s', sandboxMode,
      '--skip-git-repo-check',
      '-m', candidate,
    ];

    const args = options.resumeSessionId
      ? [...baseArgs, 'resume', options.resumeSessionId, options.prompt]
      : [...baseArgs, options.prompt];

    try {
      const { stdout, stderr } = await execFileAsync(options.codexPath, args, {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 10 * 60 * 1000,
        maxBuffer: 8 * 1024 * 1024,
      });

      const events = parseCodexEvents(stdout);
      const errorText = eventError(events) ?? stderr.trim();
      if (errorText) {
        if (isUnsupportedModelError(events)) {
          lastError = errorText;
          continue;
        }
        throw new Error(errorText);
      }

      const threadStarted = events.find((event) => event.type === 'thread.started');
      const fileText = await fs.readFile(outputPath, 'utf-8').catch(() => '');
      const text = fileText.trim() || latestAgentMessage(events).trim();
      const usage = extractUsage(events);

      return {
        sessionId: threadStarted?.thread_id ?? options.resumeSessionId ?? null,
        text,
        model: candidate,
        usage,
        estimatedCostUsd: estimateUsdFromTokens(candidate, usage),
        events,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('model is not supported')) {
        lastError = message;
        continue;
      }
      throw error;
    } finally {
      await fs.unlink(outputPath).catch(() => undefined);
    }
  }

  throw new Error(lastError);
}
