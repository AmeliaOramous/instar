/**
 * ProbeRegistry — Allowlisted probe functions for self-knowledge tree.
 *
 * Replaces arbitrary script execution with named, registered TypeScript
 * functions. Each probe is read-only, timeout-enforced, and output-capped.
 *
 * Security:
 *   - No shell access — probes are TypeScript functions only
 *   - Timeout enforcement prevents resource exhaustion
 *   - Output cap prevents context overflow
 *   - Unregistered probe names are rejected
 *
 * Born from: PROP-XXX cross-review security fix (all 3 models flagged RCE risk)
 */

import type { ProbeFn, ProbeResult, ProbeRegistration } from './types.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_CHARS = 2_000;

export class ProbeRegistry {
  private probes = new Map<string, ProbeRegistration>();

  /**
   * Register a named probe function.
   */
  register(
    name: string,
    fn: ProbeFn,
    options?: {
      timeoutMs?: number;
      maxOutputChars?: number;
      description?: string;
    },
  ): void {
    if (!name || typeof name !== 'string') {
      throw new Error('Probe name must be a non-empty string');
    }
    if (typeof fn !== 'function') {
      throw new Error(`Probe "${name}": fn must be a function`);
    }

    this.probes.set(name, {
      name,
      fn,
      timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxOutputChars: options?.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
      description: options?.description,
    });
  }

  /**
   * Execute a registered probe by name.
   * Throws if the probe is not registered.
   */
  async execute(name: string, args?: Record<string, string>): Promise<ProbeResult> {
    const registration = this.probes.get(name);
    if (!registration) {
      throw new Error(`Probe "${name}" is not registered. Available: [${this.list().join(', ')}]`);
    }

    const start = Date.now();

    try {
      const result = await Promise.race([
        registration.fn(args ?? {}),
        this.timeout(registration.timeoutMs, name),
      ]);

      // Enforce output cap
      const elapsedMs = Date.now() - start;
      if (result.content.length > registration.maxOutputChars) {
        return {
          content: result.content.slice(0, registration.maxOutputChars),
          truncated: true,
          elapsedMs,
        };
      }

      return {
        content: result.content,
        truncated: false,
        elapsedMs,
      };
    } catch (err) {
      if (err instanceof ProbeExecutionError) throw err;
      const elapsedMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      throw new ProbeExecutionError(name, message, elapsedMs);
    }
  }

  /**
   * List all registered probe names.
   */
  list(): string[] {
    return Array.from(this.probes.keys());
  }

  /**
   * Check if a probe is registered.
   */
  has(name: string): boolean {
    return this.probes.has(name);
  }

  /**
   * Get probe registration details (for validation/display).
   */
  get(name: string): ProbeRegistration | undefined {
    return this.probes.get(name);
  }

  private timeout(ms: number, probeName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new ProbeTimeoutError(probeName, ms));
      }, ms);
    });
  }
}

export class ProbeExecutionError extends Error {
  constructor(
    public readonly probeName: string,
    public readonly reason: string,
    public readonly elapsedMs: number,
  ) {
    super(`Probe "${probeName}" failed after ${elapsedMs}ms: ${reason}`);
    this.name = 'ProbeExecutionError';
  }
}

export class ProbeTimeoutError extends ProbeExecutionError {
  constructor(probeName: string, timeoutMs: number) {
    super(probeName, `Timed out after ${timeoutMs}ms`, timeoutMs);
    this.name = 'ProbeTimeoutError';
  }
}
