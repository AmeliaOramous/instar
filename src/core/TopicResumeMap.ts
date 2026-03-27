/**
 * TopicResumeMap — Persistent mapping from messaging topic IDs to runtime session IDs.
 *
 * Before killing an idle interactive session, Instar persists the runtime-native
 * session ID so the next message on that topic can resume the same conversation.
 * Claude uses JSONL session UUIDs under ~/.claude/projects. Codex uses session IDs
 * stored under CODEX_HOME.
 *
 * Storage: {stateDir}/topic-resume-map.json
 * Entries auto-prune after 24 hours.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import type { AgentRuntimeKind } from './types.js';
import { claudeProjectDirName, claudeProjectJsonlDir } from './ClaudeProjectPaths.js';

interface ResumeEntry {
  sessionId: string;
  savedAt: string;
  sessionName: string;
  runtime?: AgentRuntimeKind;
  uuid?: string;
}

interface ResumeMap {
  [topicId: string]: ResumeEntry;
}

interface RuntimeSessionInfo {
  sessionName: string;
  claudeSessionId?: string;
  runtimeSessionId?: string;
}

/** Entries older than 24 hours are pruned */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class TopicResumeMap {
  private filePath: string;
  private projectDir: string;
  private tmuxPath: string;
  private runtime: AgentRuntimeKind;
  private runtimeHome?: string;

  constructor(
    stateDir: string,
    projectDir: string,
    options?: { runtime: AgentRuntimeKind; tmuxPath?: string; runtimeHome?: string } | string,
  ) {
    this.filePath = path.join(stateDir, 'topic-resume-map.json');
    this.projectDir = projectDir;
    if (typeof options === 'string') {
      this.tmuxPath = options || 'tmux';
      this.runtime = 'claude';
      this.runtimeHome = undefined;
    } else {
      this.tmuxPath = options?.tmuxPath || 'tmux';
      this.runtime = options?.runtime || 'claude';
      this.runtimeHome = options?.runtimeHome;
    }
  }

  /**
   * Compute the Claude Code project directory name for this project.
   * Claude Code hashes the project path by replacing '/' with '-' and
   * stripping dots — e.g. /Users/foo/.bar/baz → -Users-foo--bar-baz
   */
  private claudeProjectDirName(): string {
    return claudeProjectDirName(this.projectDir);
  }

  /**
   * Get the full path to this project's Claude JSONL directory.
   */
  private claudeProjectJsonlDir(): string {
    return claudeProjectJsonlDir(this.projectDir, os.homedir());
  }

  private codexHome(): string {
    return this.runtimeHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  }

  private codexSessionsDir(): string {
    return path.join(this.codexHome(), 'sessions');
  }

  private codexSessionIndexPath(): string {
    return path.join(this.codexHome(), 'session_index.jsonl');
  }

  /**
   * Discover the Claude session UUID from the most recent JSONL file
   * in THIS project's .claude/projects/ directory.
   *
   * Scoped to the current project to avoid cross-project UUID contamination.
   */
  findClaudeSessionUuid(): string | null {
    const projectJsonlDir = this.claudeProjectJsonlDir();

    if (!fs.existsSync(projectJsonlDir)) return null;

    try {
      let latestFile: { name: string; mtime: number } | null = null;

      const files = fs.readdirSync(projectJsonlDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const filePath = path.join(projectJsonlDir, file);
        try {
          const fileStat = fs.statSync(filePath);
          if (!latestFile || fileStat.mtimeMs > latestFile.mtime) {
            latestFile = { name: file, mtime: fileStat.mtimeMs };
          }
        } catch {
          // Skip inaccessible files
        }
      }

      if (!latestFile) return null;

      const basename = path.basename(latestFile.name, '.jsonl');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(basename)) {
        return basename;
      }
    } catch {
      // Silent failure — can't read Claude projects dir
    }

    return null;
  }

  findLatestRuntimeSessionId(): string | null {
    if (this.runtime === 'claude') {
      return this.findClaudeSessionUuid();
    }
    return this.findLatestCodexSessionId();
  }

  findLatestRuntimeSessionIdForTopic(topicId: number): string | null {
    if (this.runtime === 'claude') {
      return this.findClaudeSessionUuid();
    }
    return this.findCodexSessionIdForTopic(topicId);
  }

  /**
   * Strict session-ID lookup for a topic.
   * If an explicit runtime session ID is provided, validate and return it.
   * For Codex, fall back to searching recent session logs for the topic marker.
   * For Claude, do not guess here — callers that want the mtime heuristic should
   * use findLatestRuntimeSessionIdForTopic() explicitly.
   */
  findResumeSessionIdForTopic(topicId: number, runtimeSessionId?: string): string | null {
    if (runtimeSessionId && this.runtimeSessionExists(runtimeSessionId)) {
      return runtimeSessionId;
    }

    if (this.runtime === 'codex') {
      return this.findCodexSessionIdForTopic(topicId);
    }

    return null;
  }

  /**
   * Compatibility helper for older callers that only have an explicit runtime ID.
   */
  findUuidForSession(_tmuxSession: string, runtimeSessionId?: string): string | null {
    if (runtimeSessionId && this.runtimeSessionExists(runtimeSessionId)) {
      return runtimeSessionId;
    }
    return null;
  }

  /**
   * Persist a resume mapping before killing an idle session.
   */
  save(topicId: number, sessionId: string, sessionName: string): void {
    const map = this.load();

    map[String(topicId)] = {
      sessionId,
      savedAt: new Date().toISOString(),
      sessionName,
      runtime: this.runtime,
    };

    const now = Date.now();
    for (const key of Object.keys(map)) {
      const entry = this.normalizeEntry(map[key]);
      if (!entry || now - new Date(entry.savedAt).getTime() > MAX_AGE_MS) {
        delete map[key];
      }
    }

    try {
      fs.writeFileSync(this.filePath, JSON.stringify(map, null, 2));
    } catch (err) {
      console.error(`[TopicResumeMap] Failed to save: ${err}`);
    }
  }

  /**
   * Look up a resume session ID for a topic. Returns null if not found,
   * expired, or the underlying runtime session record no longer exists.
   */
  get(topicId: number): string | null {
    const map = this.load();
    const entry = this.normalizeEntry(map[String(topicId)]);
    if (!entry) return null;

    if (Date.now() - new Date(entry.savedAt).getTime() > MAX_AGE_MS) {
      return null;
    }

    if (!this.runtimeSessionExists(entry.sessionId)) {
      return null;
    }

    return entry.sessionId;
  }

  /**
   * Remove an entry after successful resume (prevents stale reuse).
   */
  remove(topicId: number): void {
    const map = this.load();
    delete map[String(topicId)];
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(map, null, 2));
    } catch {
      // Best effort
    }
  }

  /**
   * Proactive resume heartbeat: update the topic→session mapping for all active
   * topic-linked sessions. Called periodically (for example every 60s).
   */
  refreshResumeMappings(topicSessions: Map<number, RuntimeSessionInfo>): void {
    try {
      if (!topicSessions || topicSessions.size === 0) return;

      const map = this.load();
      let updated = 0;
      const activeSessions: Array<{ topicId: number; info: RuntimeSessionInfo }> = [];

      for (const [topicId, info] of topicSessions) {
        const hasSession = spawnSync(this.tmuxPath, ['has-session', '-t', `=${info.sessionName}`]);
        if (hasSession.status !== 0) continue;
        activeSessions.push({ topicId, info });
      }

      if (activeSessions.length === 0) return;

      for (const { topicId, info } of activeSessions) {
        let sessionId = this.findResumeSessionIdForTopic(
          topicId,
          info.runtimeSessionId ?? info.claudeSessionId,
        );

        if (!sessionId && this.runtime === 'claude' && activeSessions.length === 1) {
          sessionId = this.findClaudeSessionUuid();
        }
        if (!sessionId) continue;

        const topicKey = String(topicId);
        const existingEntry = this.normalizeEntry(map[topicKey]);
        const entryAge = existingEntry ? Date.now() - new Date(existingEntry.savedAt).getTime() : Infinity;

        if (!existingEntry || existingEntry.sessionId !== sessionId || entryAge > 2 * 60 * 60 * 1000) {
          map[topicKey] = {
            sessionId,
            savedAt: new Date().toISOString(),
            sessionName: info.sessionName,
            runtime: this.runtime,
          };
          updated++;
        }
      }

      if (updated > 0) {
        const activeTopicKeys = new Set(activeSessions.map(s => String(s.topicId)));
        for (const key of Object.keys(map)) {
          const entry = this.normalizeEntry(map[key]);
          if (!entry) {
            delete map[key];
            continue;
          }
          if (!activeTopicKeys.has(key) && Date.now() - new Date(entry.savedAt).getTime() > MAX_AGE_MS) {
            delete map[key];
          }
        }

        try {
          fs.writeFileSync(this.filePath, JSON.stringify(map, null, 2));
        } catch (err) {
          console.error(`[TopicResumeMap] Failed to save heartbeat: ${err}`);
        }
      }
    } catch (err) {
      console.error('[TopicResumeMap] Resume heartbeat error:', err);
    }
  }

  private load(): ResumeMap {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch {
      // Corrupted file — start fresh
    }
    return {};
  }

  private normalizeEntry(entry: ResumeEntry | undefined): ResumeEntry | null {
    if (!entry) return null;

    const sessionId = typeof entry.sessionId === 'string' && entry.sessionId
      ? entry.sessionId
      : typeof entry.uuid === 'string' && entry.uuid
        ? entry.uuid
        : null;

    if (!sessionId || typeof entry.savedAt !== 'string' || typeof entry.sessionName !== 'string') {
      return null;
    }

    return {
      sessionId,
      savedAt: entry.savedAt,
      sessionName: entry.sessionName,
      runtime: entry.runtime,
      uuid: entry.uuid,
    };
  }

  private runtimeSessionExists(sessionId: string): boolean {
    if (this.runtime === 'claude') {
      return this.claudeJsonlExists(sessionId);
    }
    return this.codexSessionExists(sessionId);
  }

  private claudeJsonlExists(sessionId: string): boolean {
    const jsonlPath = path.join(this.claudeProjectJsonlDir(), `${sessionId}.jsonl`);
    try {
      return fs.existsSync(jsonlPath);
    } catch {
      return false;
    }
  }

  private readCodexSessionIndex(limit = 160): Array<{ id: string; updatedAt?: string }> {
    const indexPath = this.codexSessionIndexPath();
    if (!fs.existsSync(indexPath)) return [];

    try {
      const lines = fs.readFileSync(indexPath, 'utf-8')
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-limit);

      return lines.flatMap(line => {
        try {
          const parsed = JSON.parse(line) as { id?: unknown; updated_at?: unknown };
          if (typeof parsed.id !== 'string' || !parsed.id) return [];
          return [{
            id: parsed.id,
            updatedAt: typeof parsed.updated_at === 'string' ? parsed.updated_at : undefined,
          }];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }

  private findLatestCodexSessionId(): string | null {
    const entries = [...this.readCodexSessionIndex(120)].reverse();
    for (const entry of entries) {
      if (this.codexSessionBelongsToProject(entry)) {
        return entry.id;
      }
    }
    return null;
  }

  private findCodexSessionIdForTopic(topicId: number): string | null {
    const topicMarker = `[telegram:${topicId}]`;
    const entries = [...this.readCodexSessionIndex(200)].reverse();

    for (const entry of entries) {
      if (!this.codexSessionBelongsToProject(entry)) continue;
      if (this.codexSessionFileContains(entry, topicMarker)) {
        return entry.id;
      }
    }

    return null;
  }

  private codexSessionExists(sessionId: string): boolean {
    const indexed = this.readCodexSessionIndex(400).find(entry => entry.id === sessionId);
    if (indexed) {
      return this.findCodexSessionFile(indexed) !== null;
    }
    return this.findCodexSessionFile({ id: sessionId }) !== null;
  }

  private codexSessionBelongsToProject(entry: { id: string; updatedAt?: string }): boolean {
    const filePath = this.findCodexSessionFile(entry);
    if (!filePath) return false;

    try {
      const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
      for (const line of lines.slice(0, 10)) {
        if (!line) continue;
        const parsed = JSON.parse(line) as {
          type?: unknown;
          payload?: { cwd?: unknown };
        };
        if (parsed.type === 'session_meta') {
          return parsed.payload?.cwd === this.projectDir;
        }
      }
    } catch {
      // Best effort.
    }

    return false;
  }

  private codexSessionFileContains(entry: { id: string; updatedAt?: string }, needle: string): boolean {
    const filePath = this.findCodexSessionFile(entry);
    if (!filePath) return false;

    try {
      return fs.readFileSync(filePath, 'utf-8').includes(needle);
    } catch {
      return false;
    }
  }

  private findCodexSessionFile(entry: { id: string; updatedAt?: string }): string | null {
    const sessionsRoot = this.codexSessionsDir();
    if (!fs.existsSync(sessionsRoot)) return null;

    const candidateDirs: string[] = [];
    if (entry.updatedAt) {
      const stamp = new Date(entry.updatedAt);
      if (!Number.isNaN(stamp.getTime())) {
        candidateDirs.push(path.join(
          sessionsRoot,
          String(stamp.getUTCFullYear()),
          String(stamp.getUTCMonth() + 1).padStart(2, '0'),
          String(stamp.getUTCDate()).padStart(2, '0'),
        ));
      }
    }
    candidateDirs.push(sessionsRoot);

    for (const dir of candidateDirs) {
      const found = this.findCodexSessionFileRecursive(dir, entry.id, dir === sessionsRoot ? 4 : 1);
      if (found) return found;
    }

    return null;
  }

  private findCodexSessionFileRecursive(dir: string, sessionId: string, depth: number): string | null {
    if (depth < 0 || !fs.existsSync(dir)) return null;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith(`-${sessionId}.jsonl`)) {
          return fullPath;
        }
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const found = this.findCodexSessionFileRecursive(path.join(dir, entry.name), sessionId, depth - 1);
        if (found) return found;
      }
    } catch {
      // Best effort.
    }

    return null;
  }
}
