import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cheap-first intelligence routing', () => {
  it('server wiring only falls back to Claude for Claude-runtime agents', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/commands/server.ts'),
      'utf-8',
    );

    expect(source).toContain("config.sessions.runtime === 'claude-cli' && config.sessions.claudePath");
    expect(source).toContain("if (!sharedIntelligence && config.sessions.runtime === 'claude-cli')");
    expect(source).toContain('const summarizer = new TopicSummarizer(sharedIntelligence, topicMemory);');
  });

  it('reflection only uses Claude fallback when Claude runtime is selected', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/commands/reflect.ts'),
      'utf-8',
    );

    expect(source).toContain("if (paths.runtime === 'claude-cli' && paths.claudePath)");
    expect(source).toContain("if (paths.runtime === 'claude-cli') {");
    expect(source).toContain('return null;');
  });

  it('lifeline doctor session follows the configured runtime', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lifeline/TelegramLifeline.ts'),
      'utf-8',
    );

    expect(source).toContain("const runtime = this.projectConfig.sessions.runtime ?? 'claude-cli';");
    expect(source).toContain("if (runtime === 'codex-cli')");
    expect(source).toContain("} else if (runtime === 'copilot-cli')");
  });
});
