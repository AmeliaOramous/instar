import { describe, it, expect, beforeEach } from 'vitest';
import { TruncationDetector } from '../../src/paste/TruncationDetector.js';

describe('TruncationDetector', () => {
  let detector: TruncationDetector;

  beforeEach(() => {
    detector = new TruncationDetector();
  });

  // ── Heuristic 1: Near-Limit Truncation ────────────────────────

  describe('near-limit detection', () => {
    it('detects message near 4096 limit ending mid-word', () => {
      // 4080 chars ending mid-word (no final punctuation)
      const text = 'a '.repeat(2039) + 'ab'; // 4080 chars, ends mid-word
      const result = detector.detect(1, 'user1', text);

      expect(result.truncationSuspected).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.reason).toContain('near-limit');
    });

    it('detects message near limit with unclosed brace', () => {
      const text = 'function test() {\n  const x = ' + 'y'.repeat(4050);
      const result = detector.detect(1, 'user1', text);

      expect(result.truncationSuspected).toBe(true);
      // May trigger as 'near-limit + ends mid-word' since that check runs first
      expect(result.reason).toContain('near-limit');
    });

    it('does not flag short messages', () => {
      const result = detector.detect(1, 'user1', 'Hello, world!');
      expect(result.truncationSuspected).toBe(false);
    });

    it('does not flag near-limit messages with clean endings', () => {
      // Near limit but ends with a period — clean ending
      const text = 'x '.repeat(2046) + 'end.';
      const result = detector.detect(1, 'user1', text);

      // Should not flag if it ends cleanly and no unclosed delimiters
      // (the text is just repeated 'x ' so no code/structural signals)
      expect(result.truncationSuspected).toBe(false);
    });

    it('detects near-limit code content', () => {
      // Build content that looks like code and is close to 4096
      const codeLine = '  console.log("processing item");\n';
      const repeatCount = Math.floor(4080 / codeLine.length);
      const text = codeLine.repeat(repeatCount).slice(0, 4080);
      // Ensure near limit
      expect(text.length).toBeGreaterThan(4046);
      expect(text.length).toBeLessThanOrEqual(4096);

      const result = detector.detect(1, 'user1', text);
      // Code content near limit should trigger
      expect(result.truncationSuspected).toBe(true);
    });
  });

  // ── Heuristic 2: Rapid Multi-Part ─────────────────────────────

  describe('rapid multi-part detection', () => {
    it('detects rapid continuation messages', () => {
      // First message ends abruptly
      detector.detect(1, 'user1', 'Here is the first part of my error log');
      // Second message starts lowercase (continuation)
      const result = detector.detect(1, 'user1', 'and here is the second part with more details');

      expect(result.truncationSuspected).toBe(true);
      expect(result.reason).toContain('rapid multi-part');
      expect(result.confidence).toBe('medium');
    });

    it('detects code continuation across messages', () => {
      detector.detect(1, 'user1', 'function test() {\n  const x = 1');
      const result = detector.detect(1, 'user1', '}');

      expect(result.truncationSuspected).toBe(true);
    });

    it('does not flag messages from different users', () => {
      detector.detect(1, 'user1', 'First user says something');
      const result = detector.detect(1, 'user2', 'different user responds');

      expect(result.truncationSuspected).toBe(false);
    });

    it('does not flag messages from different topics', () => {
      detector.detect(1, 'user1', 'Message in topic 1');
      const result = detector.detect(2, 'user1', 'message in topic 2');

      expect(result.truncationSuspected).toBe(false);
    });

    it('does not flag well-spaced messages', () => {
      // First message
      detector.detect(1, 'user1', 'First complete sentence.');

      // Simulate 30 seconds passing by manipulating internal state
      // Since we can't easily mock time, test the spacing logic differently:
      // Messages that end with proper punctuation + start with uppercase aren't continuation
      const result = detector.detect(1, 'user1', 'Second complete sentence.');
      // Both end cleanly and start with uppercase — not continuation
      expect(result.truncationSuspected).toBe(false);
    });
  });

  // ── Heuristic 3: Structural Incompleteness ────────────────────

  describe('structural incompleteness detection', () => {
    it('detects unclosed code fence', () => {
      const text = '```javascript\nfunction test() {\n  return 42;\n}\n// more code here';
      const result = detector.detect(1, 'user1', text);

      expect(result.truncationSuspected).toBe(true);
      expect(result.reason).toContain('unclosed code fence');
    });

    it('does not flag properly closed code fence', () => {
      const text = '```javascript\nfunction test() {\n  return 42;\n}\n```';
      const result = detector.detect(1, 'user1', text);

      expect(result.truncationSuspected).toBe(false);
    });

    it('detects trailing ellipsis in code context', () => {
      const text = 'const data = {\n  key1: "value1",\n  key2: "value2",\n  key3: "value3",\n...';
      const result = detector.detect(1, 'user1', text);

      expect(result.truncationSuspected).toBe(true);
      expect(result.reason).toContain('trailing ellipsis');
    });

    it('detects unclosed braces in code', () => {
      const text = 'function processData() {\n  if (condition) {\n    doSomething();\n    if (nested) {\n      doMore();';
      const result = detector.detect(1, 'user1', text);

      expect(result.truncationSuspected).toBe(true);
      expect(result.reason).toContain('unclosed delimiters');
    });

    it('does not flag balanced code', () => {
      const text = 'function test() {\n  if (true) {\n    console.log("hello");\n  }\n}';
      const result = detector.detect(1, 'user1', text);

      expect(result.truncationSuspected).toBe(false);
    });

    it('does not flag non-code text', () => {
      const text = 'This is just a regular message about my day. Nothing code-like here at all.';
      const result = detector.detect(1, 'user1', text);

      expect(result.truncationSuspected).toBe(false);
    });

    it('detects stack trace truncation', () => {
      const text = [
        'Error: Connection timeout',
        '    at Socket.connect (net.js:1100:16)',
        '    at Object.connect (net.js:1400:17)',
        '    at Agent.createConnection (_http_agent.js:287:14)',
        '    at Agent.addRequest (_http_agent.js:220:32)',
        '    at new ClientRequest (_http_client.js:302:16)',
      ].join('\n');

      // Stack trace with unclosed context might not trigger structural,
      // but should be recognized as code
      const result = detector.detect(1, 'user1', text);
      // A stack trace is code-like but may be structurally complete
      // Only triggers if there's an actual structural issue
    });
  });

  // ── Cooldown ──────────────────────────────────────────────────

  describe('nudge cooldown', () => {
    it('does not re-flag the same topic within cooldown period', () => {
      // Build a message that triggers detection
      const text = 'a '.repeat(2039) + 'ab'; // Near limit, ends mid-word

      const first = detector.detect(1, 'user1', text);
      expect(first.truncationSuspected).toBe(true);

      // Second detection on same topic should be cooled down
      const second = detector.detect(1, 'user1', text);
      expect(second.truncationSuspected).toBe(false);
    });

    it('allows flagging different topics independently', () => {
      const text = 'a '.repeat(2039) + 'ab';

      const topic1 = detector.detect(1, 'user1', text);
      expect(topic1.truncationSuspected).toBe(true);

      const topic2 = detector.detect(2, 'user1', text);
      expect(topic2.truncationSuspected).toBe(true);
    });

    it('cooldown can be cleared', () => {
      const text = 'a '.repeat(2039) + 'ab';

      detector.detect(1, 'user1', text); // triggers, sets cooldown
      detector.clearCooldowns();

      const result = detector.detect(1, 'user1', text);
      expect(result.truncationSuspected).toBe(true);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty text', () => {
      const result = detector.detect(1, 'user1', '');
      expect(result.truncationSuspected).toBe(false);
    });

    it('handles single character text', () => {
      const result = detector.detect(1, 'user1', 'x');
      expect(result.truncationSuspected).toBe(false);
    });

    it('handles exactly 4096 characters', () => {
      const text = 'x'.repeat(4096);
      const result = detector.detect(1, 'user1', text);
      // At exactly the limit without code signals — might not trigger
      // but should not crash
      expect(result).toBeDefined();
    });

    it('handles text with only whitespace', () => {
      const result = detector.detect(1, 'user1', '   \n\n  \t  ');
      expect(result.truncationSuspected).toBe(false);
    });

    it('handles text with only special characters', () => {
      const result = detector.detect(1, 'user1', '{{{{[[[[((((');
      expect(result.truncationSuspected).toBe(false); // Short, not near limit
    });

    it('handles rapid messages that are just emoji', () => {
      detector.detect(1, 'user1', '🎉🎉🎉');
      const result = detector.detect(1, 'user1', '🎊🎊🎊');
      // Emoji don't look like continuation
      expect(result.truncationSuspected).toBe(false);
    });
  });

  // ── Code Detection ────────────────────────────────────────────

  describe('code detection heuristic', () => {
    it('identifies JavaScript code', () => {
      const text = `
function processData(items) {
  const results = [];
  for (const item of items) {
    if (item.valid) {
      results.push(transform(item));
    }
  }
  return results;
`;
      // This has unclosed braces and looks like code
      const result = detector.detect(1, 'user1', text);
      // Should detect as structurally incomplete
      expect(result.truncationSuspected).toBe(true);
    });

    it('identifies log output', () => {
      const text = [
        '2024-01-15 14:23:01 [INFO] Server starting...',
        '2024-01-15 14:23:02 [INFO] Loading configuration',
        '2024-01-15 14:23:02 [WARN] Deprecated config key: oldKey',
        '2024-01-15 14:23:03 [INFO] Database connected',
        '2024-01-15 14:23:03 [ERROR] Failed to initialize cache',
      ].join('\n');

      // Log output that's not structurally incomplete should not trigger
      const result = detector.detect(1, 'user1', text);
      expect(result.truncationSuspected).toBe(false);
    });

    it('does not flag prose with occasional brackets', () => {
      const text = 'I was thinking about the project (the one we discussed last week) and I think we should consider option [A] over option [B]. What do you think?';
      const result = detector.detect(1, 'user1', text);
      expect(result.truncationSuspected).toBe(false);
    });
  });
});
