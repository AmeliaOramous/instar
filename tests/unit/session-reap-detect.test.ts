/**
 * Session reaping and completion detection — validates that
 * SessionManager properly detects, reaps, and cleans up sessions.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Session reaping and detection', () => {
  const SOURCE_PATH = path.join(process.cwd(), 'src/core/SessionManager.ts');
  let source: string;

  it('source file exists', () => {
    source = fs.readFileSync(SOURCE_PATH, 'utf-8');
    expect(source).toBeTruthy();
  });

  describe('reapCompletedSessions', () => {
    it('skips protected sessions', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      // Protected sessions should be explicitly skipped in reap loop
      expect(source).toContain('protectedSessions.includes(session.tmuxSession)');
    });

    it('marks reaped sessions as completed with endedAt', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      // reapCompletedSessions should set status and endedAt
      expect(source).toContain("session.status = 'completed'");
      expect(source).toContain('session.endedAt');
    });

    it('returns list of reaped session IDs', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      expect(source).toContain('reaped.push(session.id)');
      expect(source).toContain('return reaped');
    });

    it('kills tmux session if still alive after completion detection', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      const reapSection = source.match(/reapCompletedSessions[\s\S]*?(?=\n\s{2}\/\*\*|\n\s{2}async)/);
      const body = reapSection![0];
      // Should check isSessionAlive AND detectCompletion
      expect(body).toContain('isSessionAlive');
      expect(body).toContain('detectCompletion');
      // Should kill if still alive after detection
      expect(body).toContain('kill-session');
    });
  });

  describe('detectCompletion', () => {
    it('checks output for completion patterns', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      expect(source).toContain('completionPatterns.some');
      expect(source).toContain('output.includes(pattern)');
    });

    it('returns false if no output captured', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      // detectCompletion should handle null output
      expect(source).toContain('if (!output) return false');
    });
  });

  describe('listRunningSessions', () => {
    it('auto-marks dead sessions as completed during listing', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      // listRunningSessions should check alive status and mark dead ones
      expect(source).toContain('isSessionAlive');
      expect(source).toContain("s.status = 'completed'");
      expect(source).toContain('this.state.saveSession(s)');
    });

    it('only returns sessions that are actually alive', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      // Should filter by alive status
      expect(source).toContain('sessions.filter');
      expect(source).toContain('return alive');
    });
  });

  describe('startMonitoring', () => {
    it('is idempotent (no double-monitoring)', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      expect(source).toContain('if (this.monitorInterval) return');
    });

    it('stopMonitoring clears interval', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      expect(source).toContain('clearInterval(this.monitorInterval)');
      expect(source).toContain('this.monitorInterval = null');
    });

    it('emits sessionComplete event', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      expect(source).toContain("this.emit('sessionComplete', session)");
    });

    it('session timeout uses 20% buffer', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      expect(source).toContain('maxDurationMinutes * 1.2');
    });

    it('does not kill protected sessions on timeout', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      // The timeout check should exclude protected sessions
      const monitorSection = source.match(/startMonitoring[\s\S]*?stopMonitoring/);
      expect(monitorSection).toBeTruthy();
      const body = monitorSection![0];
      expect(body).toContain('protectedSessions.includes');
    });
  });

  describe('spawnSession', () => {
    it('enforces max sessions limit', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      expect(source).toContain('maxSessions');
      expect(source).toContain('throw new Error');
    });

    it('checks for duplicate tmux sessions', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      expect(source).toContain('tmuxSessionExists');
      expect(source).toContain('already exists');
    });

    it('escapes single quotes in claude path for shell safety', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      expect(source).toContain("replace(/'/g, \"'\\\\''\")");
    });

    it('writes prompt to temp file to prevent shell injection', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      // The prompt should be written to a file, not passed directly as a shell argument
      expect(source).toContain('instar-prompts');
      expect(source).toContain('fs.writeFileSync(promptFile, options.prompt)');
      // The shell command should read from the file, not interpolate the prompt
      expect(source).toContain('cat ${quotedPromptFile}');
    });
  });

  describe('spawnInteractiveSession', () => {
    it('reuses existing tmux session if present', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      // spawnInteractiveSession should check if session exists and reuse
      expect(source).toContain('tmuxSessionExists(tmuxSession)');
      // If session exists, it reuses (returns) instead of creating
      expect(source).toContain('return tmuxSession');
    });

    it('waits for Claude readiness before injecting message', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      expect(source).toContain('waitForClaudeReady');
    });

    it('waitForClaudeReady checks for prompt characters', () => {
      source = fs.readFileSync(SOURCE_PATH, 'utf-8');
      // Should check for common prompt characters
      expect(source).toContain("'❯'");
      expect(source).toContain("'>'");
      expect(source).toContain("'$'");
    });
  });
});
