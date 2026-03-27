import { ClaudeCliIntelligenceProvider } from './ClaudeCliIntelligenceProvider.js';
import { CodexCliIntelligenceProvider } from './CodexCliIntelligenceProvider.js';
import type { IntelligenceProvider, SessionManagerConfig } from './types.js';

type RuntimeIntelligenceConfig = Pick<SessionManagerConfig, 'runtime' | 'runtimePath' | 'runtimeHome' | 'claudePath'>;

export function createRuntimeIntelligenceProvider(
  config: RuntimeIntelligenceConfig,
): IntelligenceProvider | null {
  if (config.runtime === 'codex') {
    return new CodexCliIntelligenceProvider(config.runtimePath, config.runtimeHome);
  }

  if (config.claudePath) {
    return new ClaudeCliIntelligenceProvider(config.claudePath);
  }

  return null;
}

export function describeRuntimeIntelligence(config: RuntimeIntelligenceConfig): string {
  return config.runtime === 'codex'
    ? 'Codex CLI'
    : 'Claude CLI subscription';
}
