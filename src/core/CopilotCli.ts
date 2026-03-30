import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ModelTier } from './types.js';
import { resolveCopilotModel } from './models.js';

const execFileAsync = promisify(execFile);

export interface RunCopilotPromptOptions {
  copilotPath: string;
  cwd: string;
  prompt: string;
  model?: string;
  modelMap?: Partial<Record<ModelTier, string>>;
  timeoutMs?: number;
}

export interface RunCopilotPromptResult {
  text: string;
  model: string;
}

function resolvePreferredCopilotModel(
  requestedModel: string | undefined,
  modelMap?: Partial<Record<ModelTier, string>>,
): string {
  const resolved = resolveCopilotModel(requestedModel ?? 'fast');

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
  const primary = resolvePreferredCopilotModel(requestedModel, modelMap);
  const candidates = [primary];

  if (primary === 'gpt-5-mini') {
    candidates.push(modelMap?.sonnet ?? 'gpt-4.1');
  }

  if (primary === 'claude-sonnet-4.5') {
    candidates.push(modelMap?.sonnet ?? 'gpt-4.1');
  }

  return [...new Set(candidates.filter(Boolean))];
}

function isUnsupportedModelMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('unknown value')
    || lower.includes('unknown model')
    || lower.includes('invalid value')
    || lower.includes('model is not available')
    || lower.includes('model is not supported');
}

export async function runCopilotPrompt(options: RunCopilotPromptOptions): Promise<RunCopilotPromptResult> {
  const candidates = buildModelCandidates(options.model, options.modelMap);
  let lastError = 'Copilot CLI did not produce a response';

  for (const candidate of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync(
        options.copilotPath,
        ['--model', candidate, '--prompt', options.prompt],
        {
          cwd: options.cwd,
          timeout: options.timeoutMs ?? 2 * 60 * 1000,
          maxBuffer: 8 * 1024 * 1024,
        },
      );

      const text = stdout.trim();
      if (!text) {
        const errText = stderr.trim();
        if (errText) {
          if (isUnsupportedModelMessage(errText)) {
            lastError = errText;
            continue;
          }
          throw new Error(errText);
        }
        throw new Error('Copilot CLI returned no output');
      }

      return {
        text,
        model: candidate,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isUnsupportedModelMessage(message)) {
        lastError = message;
        continue;
      }
      throw error;
    }
  }

  throw new Error(lastError);
}
