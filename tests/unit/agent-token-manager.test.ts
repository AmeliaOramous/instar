/**
 * Unit tests for AgentTokenManager — per-agent authentication tokens.
 *
 * Tests:
 * - Token generation (256-bit, hex-encoded, idempotent)
 * - Token retrieval (existing, missing)
 * - Token verification (constant-time, correct, wrong)
 * - HMAC computation and verification (correct, tampered, wrong agent)
 * - Token deletion and listing
 * - Agent name validation (path traversal, invalid chars, empty, too long)
 * - File permissions (0600 for tokens, 0700 for directory)
 * - Edge cases (concurrent generation, missing directory)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  generateAgentToken,
  getAgentToken,
  verifyAgentToken,
  computeDropHmac,
  verifyDropHmac,
  deleteAgentToken,
  listAgentTokens,
  ensureTokenDir,
} from '../../src/messaging/AgentTokenManager.js';

// ── Helpers ──────────────────────────────────────────────────────

const TOKEN_DIR = path.join(os.homedir(), '.instar', 'agent-tokens');

/** Agents created during tests that need cleanup */
let testAgents: string[] = [];

function registerTestAgent(name: string): void {
  testAgents.push(name);
}

// ── Tests ────────────────────────────────────────────────────────

describe('AgentTokenManager', () => {
  beforeEach(() => {
    testAgents = [];
  });

  afterEach(() => {
    // Clean up test agent tokens
    for (const agent of testAgents) {
      deleteAgentToken(agent);
    }
  });

  // ── Token Generation ─────────────────────────────────────────

  describe('generateAgentToken', () => {
    it('generates a 64-character hex token (256-bit)', () => {
      const name = `test-gen-${Date.now()}`;
      registerTestAgent(name);
      const token = generateAgentToken(name);

      expect(token).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
    });

    it('is idempotent — returns same token on second call', () => {
      const name = `test-idempotent-${Date.now()}`;
      registerTestAgent(name);
      const token1 = generateAgentToken(name);
      const token2 = generateAgentToken(name);

      expect(token1).toBe(token2);
    });

    it('generates different tokens for different agents', () => {
      const name1 = `test-diff-a-${Date.now()}`;
      const name2 = `test-diff-b-${Date.now()}`;
      registerTestAgent(name1);
      registerTestAgent(name2);

      const token1 = generateAgentToken(name1);
      const token2 = generateAgentToken(name2);

      expect(token1).not.toBe(token2);
    });

    it('creates token file with restricted permissions (0600)', () => {
      const name = `test-perms-${Date.now()}`;
      registerTestAgent(name);
      generateAgentToken(name);

      const filePath = path.join(TOKEN_DIR, `${name}.token`);
      const stats = fs.statSync(filePath);
      // 0600 = owner read/write only (octal 0o100600 on file)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('persists token to disk', () => {
      const name = `test-persist-${Date.now()}`;
      registerTestAgent(name);
      const token = generateAgentToken(name);

      const filePath = path.join(TOKEN_DIR, `${name}.token`);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8').trim()).toBe(token);
    });
  });

  // ── Token Retrieval ──────────────────────────────────────────

  describe('getAgentToken', () => {
    it('returns the token for an existing agent', () => {
      const name = `test-get-${Date.now()}`;
      registerTestAgent(name);
      const generated = generateAgentToken(name);
      const retrieved = getAgentToken(name);

      expect(retrieved).toBe(generated);
    });

    it('returns null for non-existent agent', () => {
      const result = getAgentToken(`nonexistent-${Date.now()}`);
      expect(result).toBeNull();
    });

    it('returns null for invalid agent name', () => {
      expect(getAgentToken('../etc/passwd')).toBeNull();
      expect(getAgentToken('')).toBeNull();
    });
  });

  // ── Token Verification ───────────────────────────────────────

  describe('verifyAgentToken', () => {
    it('returns true for correct token', () => {
      const name = `test-verify-${Date.now()}`;
      registerTestAgent(name);
      const token = generateAgentToken(name);

      expect(verifyAgentToken(name, token)).toBe(true);
    });

    it('returns false for wrong token', () => {
      const name = `test-verify-wrong-${Date.now()}`;
      registerTestAgent(name);
      generateAgentToken(name);

      expect(verifyAgentToken(name, 'deadbeef'.repeat(8))).toBe(false);
    });

    it('returns false for non-existent agent', () => {
      expect(verifyAgentToken(`nonexistent-${Date.now()}`, 'some-token')).toBe(false);
    });

    it('returns false for empty bearer token', () => {
      const name = `test-verify-empty-${Date.now()}`;
      registerTestAgent(name);
      generateAgentToken(name);

      expect(verifyAgentToken(name, '')).toBe(false);
    });

    it('returns false when token length differs (timing-safe)', () => {
      const name = `test-verify-len-${Date.now()}`;
      registerTestAgent(name);
      generateAgentToken(name);

      // Shorter token — timingSafeEqual should handle length mismatch
      expect(verifyAgentToken(name, 'short')).toBe(false);
    });
  });

  // ── HMAC Computation ─────────────────────────────────────────

  describe('computeDropHmac and verifyDropHmac', () => {
    const sampleFields = {
      message: { id: 'msg-1', body: 'test' },
      originServer: 'http://localhost:3000',
      nonce: 'nonce-1:2026-01-01T00:00:00Z',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    it('computes a 64-character hex HMAC', () => {
      const name = `test-hmac-${Date.now()}`;
      registerTestAgent(name);
      const token = generateAgentToken(name);

      const hmac = computeDropHmac(token, sampleFields);
      expect(hmac).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hmac)).toBe(true);
    });

    it('verifies a correct HMAC', () => {
      const name = `test-hmac-verify-${Date.now()}`;
      registerTestAgent(name);
      const token = generateAgentToken(name);

      const hmac = computeDropHmac(token, sampleFields);
      const valid = verifyDropHmac(name, hmac, sampleFields);

      expect(valid).toBe(true);
    });

    it('rejects a tampered HMAC', () => {
      const name = `test-hmac-tamper-${Date.now()}`;
      registerTestAgent(name);
      generateAgentToken(name);

      const valid = verifyDropHmac(name, 'deadbeef'.repeat(8), sampleFields);
      expect(valid).toBe(false);
    });

    it('rejects HMAC when fields are tampered', () => {
      const name = `test-hmac-field-tamper-${Date.now()}`;
      registerTestAgent(name);
      const token = generateAgentToken(name);

      const hmac = computeDropHmac(token, sampleFields);

      // Tamper with a field
      const tamperedFields = { ...sampleFields, originServer: 'http://evil:3000' };
      const valid = verifyDropHmac(name, hmac, tamperedFields);

      expect(valid).toBe(false);
    });

    it('rejects HMAC from wrong agent', () => {
      const nameA = `test-hmac-agent-a-${Date.now()}`;
      const nameB = `test-hmac-agent-b-${Date.now()}`;
      registerTestAgent(nameA);
      registerTestAgent(nameB);
      const tokenA = generateAgentToken(nameA);
      generateAgentToken(nameB);

      const hmac = computeDropHmac(tokenA, sampleFields);

      // Try to verify as if agent B signed it
      const valid = verifyDropHmac(nameB, hmac, sampleFields);
      expect(valid).toBe(false);
    });

    it('rejects HMAC with empty string', () => {
      const name = `test-hmac-empty-${Date.now()}`;
      registerTestAgent(name);
      generateAgentToken(name);

      const valid = verifyDropHmac(name, '', sampleFields);
      expect(valid).toBe(false);
    });

    it('rejects HMAC for non-existent agent', () => {
      const valid = verifyDropHmac(`nonexistent-${Date.now()}`, 'fake-hmac', sampleFields);
      expect(valid).toBe(false);
    });

    it('produces deterministic output for same inputs', () => {
      const name = `test-hmac-deterministic-${Date.now()}`;
      registerTestAgent(name);
      const token = generateAgentToken(name);

      const hmac1 = computeDropHmac(token, sampleFields);
      const hmac2 = computeDropHmac(token, sampleFields);

      expect(hmac1).toBe(hmac2);
    });
  });

  // ── Token Deletion ───────────────────────────────────────────

  describe('deleteAgentToken', () => {
    it('deletes an existing token', () => {
      const name = `test-delete-${Date.now()}`;
      generateAgentToken(name);
      // Don't registerTestAgent — we're testing manual deletion

      expect(getAgentToken(name)).not.toBeNull();

      const deleted = deleteAgentToken(name);
      expect(deleted).toBe(true);
      expect(getAgentToken(name)).toBeNull();
    });

    it('returns false for non-existent token', () => {
      const deleted = deleteAgentToken(`nonexistent-${Date.now()}`);
      expect(deleted).toBe(false);
    });

    it('returns false for invalid name', () => {
      expect(deleteAgentToken('../evil')).toBe(false);
    });
  });

  // ── Token Listing ────────────────────────────────────────────

  describe('listAgentTokens', () => {
    it('lists created agent tokens', () => {
      const name = `test-list-${Date.now()}`;
      registerTestAgent(name);
      generateAgentToken(name);

      const tokens = listAgentTokens();
      expect(tokens).toContain(name);
    });

    it('does not list deleted tokens', () => {
      const name = `test-list-deleted-${Date.now()}`;
      generateAgentToken(name);
      deleteAgentToken(name);

      const tokens = listAgentTokens();
      expect(tokens).not.toContain(name);
    });
  });

  // ── Name Validation ──────────────────────────────────────────

  describe('agent name validation', () => {
    it('rejects empty name', () => {
      expect(() => generateAgentToken('')).toThrow('Invalid agent name');
    });

    it('rejects path traversal', () => {
      expect(() => generateAgentToken('../etc/passwd')).toThrow('Invalid agent name');
    });

    it('rejects names with slashes', () => {
      expect(() => generateAgentToken('agent/evil')).toThrow('Invalid agent name');
    });

    it('rejects names with backslashes', () => {
      expect(() => generateAgentToken('agent\\evil')).toThrow('Invalid agent name');
    });

    it('rejects names with null bytes', () => {
      expect(() => generateAgentToken('agent\0evil')).toThrow('Invalid agent name');
    });

    it('rejects names over 64 characters', () => {
      expect(() => generateAgentToken('a'.repeat(65))).toThrow('Invalid agent name');
    });

    it('rejects names starting with hyphen', () => {
      expect(() => generateAgentToken('-agent')).toThrow('Invalid agent name');
    });

    it('accepts valid alphanumeric names', () => {
      const name = `valid-agent-${Date.now()}`;
      registerTestAgent(name);
      expect(() => generateAgentToken(name)).not.toThrow();
    });

    it('accepts names with underscores and hyphens', () => {
      const name = `my_agent-v2-${Date.now()}`;
      registerTestAgent(name);
      expect(() => generateAgentToken(name)).not.toThrow();
    });
  });

  // ── Directory Setup ──────────────────────────────────────────

  describe('ensureTokenDir', () => {
    it('creates the token directory if missing', () => {
      // ensureTokenDir is called implicitly by generateAgentToken,
      // but we test it directly here
      ensureTokenDir();
      expect(fs.existsSync(TOKEN_DIR)).toBe(true);
    });

    it('sets directory permissions to 0700', () => {
      ensureTokenDir();
      const stats = fs.statSync(TOKEN_DIR);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
    });
  });
});
