/**
 * Setup Wizard Completeness — ensures the AI-driven setup wizard
 * references all core features that affect the user setup experience.
 *
 * THE LESSON (v0.9.35 incident):
 * We shipped a two-tier secret management system with 61 passing tests,
 * but the setup wizard (the actual user-facing entry point) didn't know
 * about it. Users got the old flow that asked them to paste bot tokens
 * instead of offering Bitwarden or local encrypted storage first.
 *
 * The code worked. The tests passed. The feature was broken.
 *
 * Root cause: Instar has TWO setup paths:
 *   1. setup.ts — programmatic CLI (was updated)
 *   2. setup-wizard/skill.md — AI-driven conversational wizard (was NOT updated)
 *
 * This test ensures that when new features are added to setup.ts,
 * corresponding references exist in the wizard skill. If you add a
 * feature to setup.ts and this test fails, you need to update
 * .claude/skills/setup-wizard/skill.md too.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const skillPath = path.join(process.cwd(), '.claude/skills/setup-wizard/skill.md');
const setupPath = path.join(process.cwd(), 'src/commands/setup.ts');

// Only run if both files exist (they should in all normal builds)
const skillExists = fs.existsSync(skillPath);
const setupExists = fs.existsSync(setupPath);

describe('Setup Wizard Completeness', () => {
  it('setup-wizard skill.md exists', () => {
    expect(skillExists).toBe(true);
  });

  it('setup.ts exists', () => {
    expect(setupExists).toBe(true);
  });

  // Skip remaining tests if files don't exist
  if (!skillExists || !setupExists) return;

  const skill = fs.readFileSync(skillPath, 'utf-8');
  const setup = fs.readFileSync(setupPath, 'utf-8');

  // ── Core Feature References ──────────────────────────────────

  describe('secret management', () => {
    it('setup.ts imports SecretManager', () => {
      expect(setup).toContain('SecretManager');
    });

    it('wizard skill references secret management', () => {
      expect(skill.toLowerCase()).toContain('secret');
    });

    it('wizard skill mentions SecretManager by name', () => {
      expect(skill).toContain('SecretManager');
    });

    it('secret management phase comes BEFORE Telegram phase', () => {
      const secretIndex = skill.toLowerCase().indexOf('secret management');
      const telegramIndex = skill.indexOf('Phase 3: Telegram');
      expect(secretIndex).toBeGreaterThan(-1);
      expect(telegramIndex).toBeGreaterThan(-1);
      expect(secretIndex).toBeLessThan(telegramIndex);
    });

    it('wizard offers Bitwarden as an option', () => {
      expect(skill.toLowerCase()).toContain('bitwarden');
    });

    it('wizard offers local encrypted store as an option', () => {
      expect(skill.toLowerCase()).toContain('local encrypted store');
    });

    it('restore flow tries secret restoration before Telegram', () => {
      // Find the Restore Flow section
      const restoreFlowStart = skill.indexOf('### Restore Flow');
      const restoreFlowEnd = skill.indexOf('###', restoreFlowStart + 1);
      const restoreFlow = skill.substring(restoreFlowStart, restoreFlowEnd > -1 ? restoreFlowEnd : undefined);

      // Secret restoration should be mentioned
      expect(restoreFlow.toLowerCase()).toContain('secret');
      expect(restoreFlow).toContain('restoreTelegramConfig');
    });
  });

  // ── Phase Ordering ───────────────────────────────────────────

  describe('phase ordering', () => {
    it('identity phase exists and comes before secret management', () => {
      const identityIndex = skill.indexOf('Phase 2: Identity');
      const secretIndex = skill.indexOf('Phase 2.5');
      expect(identityIndex).toBeGreaterThan(-1);
      expect(secretIndex).toBeGreaterThan(-1);
      expect(identityIndex).toBeLessThan(secretIndex);
    });

    it('Telegram phase exists and comes after secret management', () => {
      const secretIndex = skill.indexOf('Phase 2.5');
      const telegramIndex = skill.indexOf('Phase 3: Telegram');
      expect(secretIndex).toBeGreaterThan(-1);
      expect(telegramIndex).toBeGreaterThan(-1);
      expect(secretIndex).toBeLessThan(telegramIndex);
    });

    it('server config phase exists and comes after Telegram', () => {
      const telegramIndex = skill.indexOf('Phase 3: Telegram');
      const configIndex = skill.indexOf('Phase 4');
      expect(telegramIndex).toBeGreaterThan(-1);
      expect(configIndex).toBeGreaterThan(-1);
      expect(telegramIndex).toBeLessThan(configIndex);
    });
  });

  // ── Feature Bridging ─────────────────────────────────────────
  // When setup.ts imports a new module, the wizard should reference it.

  describe('feature bridging: setup.ts imports → wizard references', () => {
    // Extract import statements from setup.ts
    const importPattern = /import\s+\{([^}]+)\}\s+from\s+'[^']+'/g;
    const imports: string[] = [];
    let match;
    while ((match = importPattern.exec(setup)) !== null) {
      const names = match[1].split(',').map(s => s.trim()).filter(s => s && !s.startsWith('type '));
      imports.push(...names);
    }

    // Key feature modules that MUST be referenced in the wizard
    // Add to this list when new features are added to setup.ts
    const requiredWizardReferences: Array<{ module: string; reason: string }> = [
      {
        module: 'SecretManager',
        reason: 'Secret management must be offered during setup before Telegram',
      },
      // Future: add more as features are added to setup.ts
      // { module: 'SomeNewFeature', reason: 'Must be configured during setup' },
    ];

    for (const { module, reason } of requiredWizardReferences) {
      it(`setup.ts imports ${module}`, () => {
        expect(imports).toContain(module);
      });

      it(`wizard references ${module} (${reason})`, () => {
        expect(skill).toContain(module);
      });
    }
  });

  // ── Telegram Skip Guard ──────────────────────────────────────
  // The wizard must check for existing valid credentials before
  // asking the user to set up Telegram from scratch.

  describe('Telegram skip guard', () => {
    it('Phase 3 checks for existing credentials before full setup', () => {
      // Find Phase 3 content
      const phase3Start = skill.indexOf('Phase 3: Telegram');
      const phase4Start = skill.indexOf('Phase 4');
      const phase3 = skill.substring(phase3Start, phase4Start > -1 ? phase4Start : undefined);

      // Should mention checking/skipping if credentials already exist
      const hasSkipLogic =
        phase3.includes('skip') ||
        phase3.includes('already') ||
        phase3.includes('restored') ||
        phase3.includes('restoreTelegramConfig');

      expect(hasSkipLogic).toBe(true);
    });
  });
});
