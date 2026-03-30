import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { runCodexPrompt } from '../core/CodexCli.js';
import type { RunCodexPromptOptions } from '../core/CodexCli.js';

interface WorkerOptions {
  codexPath: string;
  cwd: string;
  sandboxMode: NonNullable<RunCodexPromptOptions['sandboxMode']>;
  model: string;
  stateFile: string;
  resumeSessionId?: string;
}

interface WorkerState {
  sessionId?: string;
  model?: string;
  lastCostUsd?: number | null;
  totalCostUsd?: number;
  updatedAt?: string;
}

const READY_MARKER = 'INSTAR_CODEX_READY';
const MESSAGE_PREFIX = '__INSTAR_MSG__';

function parseArgs(argv: string[]): WorkerOptions {
  const args = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }
    args.set(arg, value);
    i += 1;
  }

  const codexPath = args.get('--codex-path');
  const cwd = args.get('--cwd');
  const sandboxMode = args.get('--sandbox') as WorkerOptions['sandboxMode'] | undefined;
  const model = args.get('--model');
  const stateFile = args.get('--state-file');

  if (!codexPath || !cwd || !sandboxMode || !model || !stateFile) {
    throw new Error('Missing required arguments for CodexSessionWorker');
  }

  return {
    codexPath,
    cwd,
    sandboxMode,
    model,
    stateFile,
    resumeSessionId: args.get('--resume-session'),
  };
}

function loadState(stateFile: string): WorkerState {
  if (!fs.existsSync(stateFile)) return {};

  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as WorkerState;
  } catch {
    return {};
  }
}

function saveState(stateFile: string, state: WorkerState): void {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
}

function decodeMessage(line: string): string {
  if (!line.startsWith(MESSAGE_PREFIX)) {
    return line;
  }

  const encoded = line.slice(MESSAGE_PREFIX.length);
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

function emitReady(): void {
  process.stdout.write(`${READY_MARKER}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const state = loadState(options.stateFile);
  if (!state.sessionId && options.resumeSessionId) {
    state.sessionId = options.resumeSessionId;
  }
  if (!state.model) {
    state.model = options.model;
  }
  saveState(options.stateFile, state);

  let currentSessionId = state.sessionId;
  let totalCostUsd = state.totalCostUsd ?? 0;
  let queue = Promise.resolve();

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  emitReady();

  rl.on('line', (line) => {
    queue = queue
      .then(async () => {
        const prompt = decodeMessage(line).trim();
        if (!prompt) {
          emitReady();
          return;
        }

        const result = await runCodexPrompt({
          codexPath: options.codexPath,
          cwd: options.cwd,
          prompt,
          model: options.model,
          sandboxMode: options.sandboxMode,
          resumeSessionId: currentSessionId,
        });

        if (result.sessionId) {
          currentSessionId = result.sessionId;
        }

        if (typeof result.estimatedCostUsd === 'number') {
          totalCostUsd = roundUsd(totalCostUsd + result.estimatedCostUsd);
        }

        saveState(options.stateFile, {
          sessionId: currentSessionId,
          model: result.model,
          lastCostUsd: result.estimatedCostUsd,
          totalCostUsd,
          updatedAt: new Date().toISOString(),
        });

        if (result.text.trim()) {
          process.stdout.write(`${result.text.trimEnd()}\n`);
        }

        const usage = result.usage;
        if (usage || typeof result.estimatedCostUsd === 'number') {
          process.stdout.write(
            [
              `[InstarGPT] model=${result.model}`,
              usage ? `input=${usage.inputTokens}` : null,
              usage?.cachedInputTokens != null ? `cached_input=${usage.cachedInputTokens}` : null,
              usage ? `output=${usage.outputTokens}` : null,
              result.estimatedCostUsd != null ? `est_cost_usd=${result.estimatedCostUsd}` : null,
              typeof result.estimatedCostUsd === 'number' ? `total_est_cost_usd=${totalCostUsd}` : null,
            ].filter(Boolean).join(' ') + '\n',
          );
        }

        emitReady();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[InstarGPT] Codex worker error: ${message}\n`);
        emitReady();
      });
  });

  rl.on('close', () => {
    queue.catch(() => undefined).finally(() => process.exit(0));
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[InstarGPT] Codex worker fatal: ${message}\n`);
  process.exit(1);
});
