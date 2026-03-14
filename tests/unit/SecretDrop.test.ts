/**
 * Unit tests for SecretDrop — secure secret submission.
 *
 * Tests creation, retrieval, submission, expiry, CSRF, and one-time-use behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecretDrop } from '../../src/server/SecretDrop.js';

describe('SecretDrop', () => {
  let drop: SecretDrop;

  beforeEach(() => {
    drop = new SecretDrop('TestAgent');
  });

  afterEach(() => {
    drop.shutdown();
  });

  describe('create', () => {
    it('creates a request with a 64-char hex token', () => {
      const { token } = drop.create({ label: 'API Key' });
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('creates unique tokens for each request', () => {
      const a = drop.create({ label: 'Key A' });
      const b = drop.create({ label: 'Key B' });
      expect(a.token).not.toBe(b.token);
    });

    it('stores pending request with correct metadata', () => {
      const { token } = drop.create({
        label: 'Database Password',
        description: 'Needed for production migration',
        topicId: 42,
      });
      const pending = drop.getPending(token);
      expect(pending).not.toBeNull();
      expect(pending!.label).toBe('Database Password');
      expect(pending!.description).toBe('Needed for production migration');
      expect(pending!.topicId).toBe(42);
      expect(pending!.agentName).toBe('TestAgent');
    });

    it('defaults to a single masked "secret" field', () => {
      const { token } = drop.create({ label: 'API Key' });
      const pending = drop.getPending(token);
      expect(pending!.fields).toHaveLength(1);
      expect(pending!.fields[0].name).toBe('secret');
      expect(pending!.fields[0].masked).toBe(true);
    });

    it('supports custom fields', () => {
      const { token } = drop.create({
        label: 'Login Credentials',
        fields: [
          { name: 'username', label: 'Username', masked: false },
          { name: 'password', label: 'Password', masked: true },
        ],
      });
      const pending = drop.getPending(token);
      expect(pending!.fields).toHaveLength(2);
      expect(pending!.fields[0].name).toBe('username');
      expect(pending!.fields[0].masked).toBe(false);
      expect(pending!.fields[1].name).toBe('password');
    });

    it('enforces max pending limit', () => {
      // Create 20 (the max)
      for (let i = 0; i < 20; i++) {
        drop.create({ label: `Key ${i}` });
      }
      expect(() => drop.create({ label: 'One too many' })).toThrow(/Too many pending/);
    });
  });

  describe('getPending', () => {
    it('returns null for unknown token', () => {
      expect(drop.getPending('nonexistent')).toBeNull();
    });

    it('returns null for expired request', () => {
      const { token } = drop.create({ label: 'Expiring', ttlMs: 60_000 });
      const pending = drop.getPending(token);
      // Manually expire it
      (pending as any).expiresAt = Date.now() - 1;
      expect(drop.getPending(token)).toBeNull();
    });
  });

  describe('submit', () => {
    it('accepts valid submission with correct CSRF', () => {
      const { token } = drop.create({ label: 'API Key' });
      const pending = drop.getPending(token)!;

      const submission = drop.submit(token, pending.csrfToken, { secret: 'sk-12345' });
      expect(submission).not.toBeNull();
      expect(submission!.values.secret).toBe('sk-12345');
      expect(submission!.label).toBe('API Key');
      expect(submission!.receivedAt).toBeTruthy();
    });

    it('is one-time use — second submission fails', () => {
      const { token } = drop.create({ label: 'One-time' });
      const pending = drop.getPending(token)!;

      const first = drop.submit(token, pending.csrfToken, { secret: 'value' });
      expect(first).not.toBeNull();

      const second = drop.submit(token, pending.csrfToken, { secret: 'value' });
      expect(second).toBeNull();
    });

    it('rejects invalid CSRF token', () => {
      const { token } = drop.create({ label: 'CSRF Test' });

      const submission = drop.submit(token, 'wrong-csrf-token', { secret: 'value' });
      expect(submission).toBeNull();

      // Original request should still be pending (not consumed)
      expect(drop.getPending(token)).not.toBeNull();
    });

    it('rejects submission with missing required fields', () => {
      const { token } = drop.create({
        label: 'Multi-field',
        fields: [
          { name: 'user', label: 'Username' },
          { name: 'pass', label: 'Password' },
        ],
      });
      const pending = drop.getPending(token)!;

      // Only provide one field
      const submission = drop.submit(token, pending.csrfToken, { user: 'admin' });
      expect(submission).toBeNull();
    });

    it('rejects submission with empty fields', () => {
      const { token } = drop.create({ label: 'Empty Test' });
      const pending = drop.getPending(token)!;

      const submission = drop.submit(token, pending.csrfToken, { secret: '   ' });
      expect(submission).toBeNull();
    });

    it('strips extra fields not in the request', () => {
      const { token } = drop.create({ label: 'Strip Test' });
      const pending = drop.getPending(token)!;

      const submission = drop.submit(token, pending.csrfToken, {
        secret: 'real-value',
        injected: 'should-be-removed',
      });
      expect(submission).not.toBeNull();
      expect(submission!.values.secret).toBe('real-value');
      expect(submission!.values).not.toHaveProperty('injected');
    });

    it('trims whitespace from values', () => {
      const { token } = drop.create({ label: 'Trim Test' });
      const pending = drop.getPending(token)!;

      const submission = drop.submit(token, pending.csrfToken, { secret: '  sk-12345  ' });
      expect(submission!.values.secret).toBe('sk-12345');
    });

    it('fires onReceive callback', () => {
      let received: Record<string, string> | null = null;
      const { token } = drop.create({
        label: 'Callback Test',
        onReceive: (values) => { received = values; },
      });
      const pending = drop.getPending(token)!;

      drop.submit(token, pending.csrfToken, { secret: 'callback-value' });
      expect(received).toEqual({ secret: 'callback-value' });
    });

    it('preserves topicId in submission', () => {
      const { token } = drop.create({ label: 'Topic Test', topicId: 999 });
      const pending = drop.getPending(token)!;

      const submission = drop.submit(token, pending.csrfToken, { secret: 'value' });
      expect(submission!.topicId).toBe(999);
    });
  });

  describe('getReceived', () => {
    it('returns and removes a received submission', () => {
      const { token } = drop.create({ label: 'Retrieve Test' });
      const pending = drop.getPending(token)!;
      drop.submit(token, pending.csrfToken, { secret: 'retrieve-me' });

      const first = drop.getReceived(token);
      expect(first).not.toBeNull();
      expect(first!.values.secret).toBe('retrieve-me');

      // Second call should return null (already consumed)
      const second = drop.getReceived(token);
      expect(second).toBeNull();
    });
  });

  describe('listPending', () => {
    it('lists all pending requests', () => {
      drop.create({ label: 'A' });
      drop.create({ label: 'B' });

      const list = drop.listPending();
      expect(list).toHaveLength(2);
      expect(list.map(p => p.label)).toContain('A');
      expect(list.map(p => p.label)).toContain('B');
    });

    it('marks expired requests', () => {
      const { token } = drop.create({ label: 'Expiring', ttlMs: 60_000 });
      const pending = drop.getPending(token)!;
      (pending as any).expiresAt = Date.now() - 1;

      const list = drop.listPending();
      const item = list.find(p => p.token === token);
      expect(item!.expired).toBe(true);
    });
  });

  describe('cancel', () => {
    it('cancels a pending request', () => {
      const { token } = drop.create({ label: 'Cancel Me' });
      expect(drop.cancel(token)).toBe(true);
      expect(drop.getPending(token)).toBeNull();
    });

    it('returns false for unknown token', () => {
      expect(drop.cancel('nonexistent')).toBe(false);
    });
  });

  describe('renderForm', () => {
    it('renders valid HTML with agent name and label', () => {
      const { token } = drop.create({ label: 'API Key', description: 'For OpenAI access' });
      const request = drop.getPending(token)!;

      const html = drop.renderForm(request);
      expect(html).toContain('TestAgent');
      expect(html).toContain('API Key');
      expect(html).toContain('For OpenAI access');
      expect(html).toContain('_csrf');
      expect(html).toContain(request.csrfToken);
    });

    it('escapes HTML in label and description', () => {
      const { token } = drop.create({
        label: '<script>alert("xss")</script>',
        description: '"><img onerror=alert(1)>',
      });
      const request = drop.getPending(token)!;

      const html = drop.renderForm(request);
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('renderExpiredPage', () => {
    it('renders an expired page', () => {
      const html = drop.renderExpiredPage();
      expect(html).toContain('Expired');
      expect(html).toContain('no longer valid');
    });
  });
});
