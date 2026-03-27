import os from 'node:os';
import path from 'node:path';

/**
 * Claude stores per-project JSONL logs under ~/.claude/projects/<hashed-project-path>.
 * Normalize separators and drive markers so the hash is stable across platforms.
 */
export function claudeProjectDirName(projectDir: string): string {
  return projectDir.replace(/[\\/.:]/g, '-');
}

export function claudeProjectJsonlDir(projectDir: string, homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.claude', 'projects', claudeProjectDirName(projectDir));
}
