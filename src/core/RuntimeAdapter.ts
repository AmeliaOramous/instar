import type { AgentRuntimeKind, ModelTier, SessionManagerConfig } from './types.js';

export interface RuntimeCommand {
  binary: string;
  args: string[];
  env: Record<string, string>;
}

function modelFlag(runtime: AgentRuntimeKind, model?: ModelTier): string[] {
  if (!model) return [];

  if (runtime === 'claude') {
    return ['--model', model];
  }

  const codexModelMap: Record<ModelTier, string> = {
    haiku: 'gpt-5-codex-mini',
    sonnet: 'gpt-5-codex',
    opus: 'gpt-5.4',
  };
  return ['--model', codexModelMap[model]];
}

function runtimeEnv(config: SessionManagerConfig): Record<string, string> {
  if (config.runtime === 'codex' && config.runtimeHome) {
    return { CODEX_HOME: config.runtimeHome };
  }
  return {};
}

export function buildBatchRuntimeCommand(
  config: SessionManagerConfig,
  options: { prompt: string; model?: ModelTier },
): RuntimeCommand {
  if (config.runtime === 'codex') {
    return {
      binary: config.runtimePath,
      args: [
        'exec',
        '--ask-for-approval', 'never',
        '--sandbox', 'danger-full-access',
        '--skip-git-repo-check',
        ...modelFlag(config.runtime, options.model),
        options.prompt,
      ],
      env: runtimeEnv(config),
    };
  }

  return {
    binary: config.runtimePath,
    args: [
      '--dangerously-skip-permissions',
      ...modelFlag(config.runtime, options.model),
      '-p',
      options.prompt,
    ],
    env: runtimeEnv(config),
  };
}

export function buildInteractiveRuntimeCommand(
  config: SessionManagerConfig,
  options?: { resumeSessionId?: string },
): RuntimeCommand {
  if (config.runtime === 'codex') {
    const args = options?.resumeSessionId
      ? ['resume', options.resumeSessionId]
      : [];
    args.push(
      '--ask-for-approval', 'never',
      '--sandbox', 'danger-full-access',
    );

    return {
      binary: config.runtimePath,
      args,
      env: runtimeEnv(config),
    };
  }

  const args = ['--dangerously-skip-permissions'];
  if (options?.resumeSessionId) {
    args.push('--resume', options.resumeSessionId);
  }

  return {
    binary: config.runtimePath,
    args,
    env: runtimeEnv(config),
  };
}

export function buildTriageRuntimeCommand(
  config: SessionManagerConfig,
  options: { allowedTools: string[]; permissionMode: string; resumeSessionId?: string },
): RuntimeCommand {
  if (config.runtime === 'codex') {
    const args = options.resumeSessionId
      ? ['resume', options.resumeSessionId]
      : [];
    args.push(
      '--ask-for-approval', options.permissionMode === 'never' ? 'never' : 'on-request',
      '--sandbox', 'workspace-write',
    );

    return {
      binary: config.runtimePath,
      args,
      env: runtimeEnv(config),
    };
  }

  const args = [
    '--allowedTools', options.allowedTools.join(','),
    '--permission-mode', options.permissionMode,
  ];

  if (options.resumeSessionId) {
    args.push('--resume', options.resumeSessionId);
  }

  return {
    binary: config.runtimePath,
    args,
    env: runtimeEnv(config),
  };
}

export function isRuntimeReady(config: SessionManagerConfig, output: string): boolean {
  const trimmed = output.trim();
  if (config.runtime === 'codex') {
    // Codex prompt rendering is less stable than Claude's TUI markers across
    // platforms, so treat any visible prompt or normal terminal cursor state
    // as ready enough for injection.
    return trimmed.length > 0;
  }

  return trimmed.includes('❯') || trimmed.includes('bypass permissions');
}

export function idlePromptPatterns(config: SessionManagerConfig): string[] {
  if (config.runtime === 'codex') {
    return [];
  }

  return [
    'bypass permissions on',
    'shift+tab to cycle',
    'auto-accept edits',
  ];
}

export function runtimeProcessNames(config: SessionManagerConfig): string[] {
  if (config.runtime === 'codex') {
    return ['codex', 'node'];
  }

  return ['claude', 'node'];
}
