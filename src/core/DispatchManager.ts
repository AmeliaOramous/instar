/**
 * Dispatch Manager — receives and integrates intelligence from Dawn.
 *
 * The counterpart to FeedbackManager: while feedback flows agent → Dawn,
 * dispatches flow Dawn → agent. This is the "collective intelligence"
 * distribution channel.
 *
 * Security model:
 *   Layer 1 (Transport): HTTPS only, source URL validation
 *   Layer 2 (Identity): Sends agent identification headers
 *   Layer 3 (Intelligence): Agent evaluates dispatch content before applying
 *
 * Dispatches are stored locally in .instar/state/dispatches.json and
 * can be loaded into agent context for behavioral integration.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DispatchConfig } from './types.js';

export interface Dispatch {
  dispatchId: string;
  type: 'strategy' | 'behavioral' | 'lesson' | 'configuration' | 'security';
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  minVersion?: string;
  maxVersion?: string;
  createdAt: string;
  /** When this dispatch was received by this agent */
  receivedAt: string;
  /** Whether this dispatch has been acknowledged/applied */
  applied: boolean;
}

export interface DispatchCheckResult {
  /** Number of new dispatches received */
  newCount: number;
  /** The new dispatches (if any) */
  dispatches: Dispatch[];
  /** When this check was performed */
  checkedAt: string;
  /** Any error that occurred */
  error?: string;
}

export class DispatchManager {
  private config: DispatchConfig;
  private dispatchFile: string;
  private version: string;
  private lastCheckFile: string;

  constructor(config: DispatchConfig) {
    if (config.dispatchUrl) {
      DispatchManager.validateDispatchUrl(config.dispatchUrl);
    }
    this.config = config;
    this.dispatchFile = config.dispatchFile;
    this.version = config.version || '0.0.0';
    this.lastCheckFile = config.dispatchFile.replace('.json', '-last-check.json');
  }

  /** Validate dispatch URL is HTTPS and not internal. */
  private static validateDispatchUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`DispatchManager: invalid dispatch URL: ${url}`);
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('DispatchManager: dispatch URL must use HTTPS');
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0' ||
        host.startsWith('10.') || host.startsWith('192.168.') || host.endsWith('.local') ||
        host.startsWith('169.254.') || host === '[::1]') {
      throw new Error('DispatchManager: dispatch URL must not point to internal addresses');
    }
  }

  /** Standard headers identifying this agent. */
  private get requestHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'User-Agent': `instar/${this.version} (node/${process.version})`,
      'X-Instar-Version': this.version,
    };
  }

  /**
   * Poll for new dispatches since last check.
   */
  async check(): Promise<DispatchCheckResult> {
    if (!this.config.enabled || !this.config.dispatchUrl) {
      return { newCount: 0, dispatches: [], checkedAt: new Date().toISOString() };
    }

    const lastCheck = this.getLastCheckTime();
    const now = new Date().toISOString();

    try {
      const url = new URL(this.config.dispatchUrl);
      if (lastCheck) {
        url.searchParams.set('since', lastCheck);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: this.requestHeaders,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          newCount: 0,
          dispatches: [],
          checkedAt: now,
          error: `Server returned ${response.status}: ${errorText}`,
        };
      }

      const data = await response.json() as {
        dispatches: Array<{
          dispatchId: string;
          type: string;
          title: string;
          content: string;
          priority: string;
          minVersion?: string;
          maxVersion?: string;
          createdAt: string;
        }>;
        count: number;
      };

      // Filter out dispatches we already have
      const existing = this.loadDispatches();
      const existingIds = new Set(existing.map(d => d.dispatchId));

      const newDispatches: Dispatch[] = data.dispatches
        .filter(d => !existingIds.has(d.dispatchId))
        .map(d => ({
          dispatchId: d.dispatchId,
          type: d.type as Dispatch['type'],
          title: d.title,
          content: d.content,
          priority: (d.priority || 'normal') as Dispatch['priority'],
          minVersion: d.minVersion,
          maxVersion: d.maxVersion,
          createdAt: d.createdAt,
          receivedAt: now,
          applied: false,
        }));

      // Append new dispatches
      if (newDispatches.length > 0) {
        this.appendDispatches(newDispatches);
      }

      // Save last check time
      this.saveLastCheckTime(now);

      return {
        newCount: newDispatches.length,
        dispatches: newDispatches,
        checkedAt: now,
      };
    } catch (err) {
      return {
        newCount: 0,
        dispatches: [],
        checkedAt: now,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * List all received dispatches.
   */
  list(): Dispatch[] {
    return this.loadDispatches();
  }

  /**
   * List only unapplied dispatches.
   */
  pending(): Dispatch[] {
    return this.loadDispatches().filter(d => !d.applied);
  }

  /**
   * Mark a dispatch as applied.
   */
  markApplied(dispatchId: string): boolean {
    const dispatches = this.loadDispatches();
    const dispatch = dispatches.find(d => d.dispatchId === dispatchId);
    if (!dispatch) return false;
    dispatch.applied = true;
    this.saveDispatches(dispatches);
    return true;
  }

  /**
   * Get a single dispatch by ID.
   */
  get(dispatchId: string): Dispatch | null {
    return this.loadDispatches().find(d => d.dispatchId === dispatchId) ?? null;
  }

  /**
   * Generate a context string for loading into agent sessions.
   * Returns pending high-priority dispatches formatted for LLM consumption.
   */
  generateContext(): string {
    const pending = this.pending();
    if (pending.length === 0) return '';

    // Sort by priority (critical > high > normal > low)
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    pending.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const lines: string[] = [
      '## Intelligence Dispatches',
      '',
      `${pending.length} pending dispatch${pending.length === 1 ? '' : 'es'} from Dawn:`,
      '',
    ];

    for (const d of pending) {
      const priorityTag = d.priority === 'critical' ? ' [CRITICAL]' :
                           d.priority === 'high' ? ' [HIGH]' : '';
      lines.push(`### ${d.title}${priorityTag}`);
      lines.push(`Type: ${d.type} | ID: ${d.dispatchId}`);
      lines.push('');
      lines.push(d.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  // ── Private helpers ──────────────────────────────────────────────

  private loadDispatches(): Dispatch[] {
    if (!fs.existsSync(this.dispatchFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.dispatchFile, 'utf-8'));
    } catch {
      return [];
    }
  }

  private saveDispatches(items: Dispatch[]): void {
    const dir = path.dirname(this.dispatchFile);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.dispatchFile}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(items, null, 2));
      fs.renameSync(tmpPath, this.dispatchFile);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      throw err;
    }
  }

  private appendDispatches(newItems: Dispatch[]): void {
    const items = this.loadDispatches();
    items.push(...newItems);
    // Cap at 500 dispatches
    const capped = items.length > 500 ? items.slice(-500) : items;
    this.saveDispatches(capped);
  }

  private getLastCheckTime(): string | null {
    if (!fs.existsSync(this.lastCheckFile)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(this.lastCheckFile, 'utf-8'));
      return data.lastCheck || null;
    } catch {
      return null;
    }
  }

  private saveLastCheckTime(time: string): void {
    const dir = path.dirname(this.lastCheckFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.lastCheckFile, JSON.stringify({ lastCheck: time }));
  }
}
