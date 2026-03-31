import type { SessionRuntime } from './types.js';

function normalizeRuntime(runtime?: SessionRuntime): SessionRuntime {
  return runtime ?? 'claude-cli';
}

export function getRuntimeQuotaBrand(runtime?: SessionRuntime): string {
  switch (normalizeRuntime(runtime)) {
    case 'codex-cli':
      return 'ChatGPT/Codex';
    case 'copilot-cli':
      return 'GitHub Copilot';
    case 'claude-cli':
    default:
      return 'Claude';
  }
}

export function formatRuntimeQuotaExceededMessage(runtime?: SessionRuntime, resetTime?: string | null): string {
  const brand = getRuntimeQuotaBrand(runtime);
  if (resetTime) {
    return `The agent has hit its ${brand} usage limit. Quota resets ${resetTime}. The session is paused until then — no work is being done.`;
  }
  return `The agent has hit its ${brand} usage limit. The session is paused until the quota resets — no work is being done.`;
}

export function getRuntimeQuotaRecoveryHint(runtime?: SessionRuntime): string {
  switch (normalizeRuntime(runtime)) {
    case 'codex-cli':
      return 'Use /quota to inspect the current usage monitor, or wait for the ChatGPT/Codex limit to reset.';
    case 'copilot-cli':
      return 'Use /quota to inspect the current usage monitor, or wait for the GitHub Copilot limit to reset.';
    case 'claude-cli':
    default:
      return 'Use /quota to check accounts, /switch-account to switch, or /login to authenticate a new account.';
  }
}

export function getQuotaCapabilityDescription(runtime?: SessionRuntime): string {
  switch (normalizeRuntime(runtime)) {
    case 'codex-cli':
      return 'Surfaces quota and rate-limit pressure for ChatGPT/Codex-backed sessions when available. Sends warnings as work approaches backend limits and can throttle work under quota pressure.';
    case 'copilot-cli':
      return 'Surfaces quota and rate-limit pressure for GitHub Copilot-backed sessions when available. Sends warnings as work approaches backend limits and can throttle work under quota pressure.';
    case 'claude-cli':
    default:
      return 'Tracks Claude API token usage in real-time. Sends warnings when approaching limits, enforces quotas, and auto-switches between accounts if configured.';
  }
}
