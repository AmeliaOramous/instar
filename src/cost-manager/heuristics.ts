/**
 * Rule-based heuristics for model tier selection
 * Determines when to upgrade from economy → standard or standard → high
 */

import { ModelTier, getTierModel } from "./pricing.js";

export interface UpgradeSignals {
  failureCount: number; // Number of consecutive failures
  toolUseCount: number; // Number of tools used in call
  inputTokens: number; // Input tokens (proxy for context size)
  largeCodeChange: boolean; // Large diff (>500 lines)?
  latencySensitive: boolean; // Time-critical task?
  previousTier: ModelTier;
}

export interface UpgradeDecision {
  recommendedTier: ModelTier;
  reasons: string[];
  shouldExplore: boolean;
}

/**
 * Evaluate upgrade heuristics
 * Returns recommended tier and reasoning
 */
export function evaluateUpgrade(signals: UpgradeSignals): UpgradeDecision {
  const reasons: string[] = [];
  let recommendedTier = signals.previousTier;
  let shouldExplore = false;

  // Check failure-based upgrade (economy → standard)
  if (signals.failureCount >= 2 && signals.previousTier === "economy") {
    reasons.push("Failed 2+ times on economy model");
    recommendedTier = "standard";
  }

  // Check tool use (3+ tools)
  if (signals.toolUseCount >= 3 && signals.previousTier === "economy") {
    reasons.push(`Complex tool chain detected (${signals.toolUseCount} tools)`);
    recommendedTier = "standard";
  }

  // Check large context (>4K input tokens)
  if (signals.inputTokens > 4000 && signals.previousTier === "economy") {
    reasons.push(`Large context (${signals.inputTokens} input tokens)`);
    recommendedTier = "standard";
  }

  // Check large code changes (>500 lines)
  if (signals.largeCodeChange && signals.previousTier === "economy") {
    reasons.push("Large code change (>500 lines)");
    recommendedTier = "standard";
  }

  // Check latency-sensitive tasks
  if (signals.latencySensitive && signals.previousTier === "economy") {
    reasons.push("Latency-sensitive task");
    recommendedTier = "standard";
  }

  // Standard → high upgrade (reserved for explicitly marked critical paths)
  // Currently not auto-triggered; would need explicit signal

  return {
    recommendedTier,
    reasons,
    shouldExplore,
  };
}

/**
 * Check if a call should be explored (for bandit learning)
 * Phase 2 feature: return true occasionally to test higher tiers
 */
export function shouldExplore(
  currentTier: ModelTier,
  explorationRate: number = 0.1
): boolean {
  // Placeholder for bandit exploration
  // In Phase 2, this will track per-task-family success rates
  return Math.random() < explorationRate;
}
