/**
 * Unit tests for CostManager module
 * Tests pricing, heuristics, budget enforcement
 */

import { describe, it, expect } from "vitest";
import {
  estimateCost,
  getTierModel,
  getModelTier,
  TIER_MAPPING,
} from "./pricing.js";
import { evaluateUpgrade } from "./heuristics.js";
import { checkBudget, DEFAULT_BUDGETS, formatBudgetStatus } from "./budgets.js";
import { CostManager } from "./cost-manager.js";

describe("pricing", () => {
  it("estimates cost correctly", () => {
    // gpt-4o-mini: $0.15 per 1M input, $0.60 per 1M output
    const cost = estimateCost("gpt-4o-mini", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.75, 2); // 0.15 + 0.60
  });

  it("throws on unknown model", () => {
    expect(() => estimateCost("unknown-model", 1000, 1000)).toThrow();
  });

  it("maps tiers to models", () => {
    expect(getTierModel("economy")).toBe("gpt-4o-mini");
    expect(getTierModel("standard")).toBe("gpt-4o");
    expect(getTierModel("high")).toBe("gpt-4x");
  });

  it("gets tier from model name", () => {
    expect(getModelTier("gpt-4o-mini")).toBe("economy");
    expect(getModelTier("gpt-4o")).toBe("standard");
    expect(getModelTier("gpt-4x")).toBe("high");
    expect(getModelTier("unknown")).toBeNull();
  });
});

describe("heuristics", () => {
  it("upgrades on repeated failures", () => {
    const decision = evaluateUpgrade({
      failureCount: 2,
      toolUseCount: 0,
      inputTokens: 1000,
      largeCodeChange: false,
      latencySensitive: false,
      previousTier: "economy",
    });

    expect(decision.recommendedTier).toBe("standard");
    expect(decision.reasons).toContain("Failed 2+ times on economy model");
  });

  it("upgrades on complex tool use", () => {
    const decision = evaluateUpgrade({
      failureCount: 0,
      toolUseCount: 3,
      inputTokens: 1000,
      largeCodeChange: false,
      latencySensitive: false,
      previousTier: "economy",
    });

    expect(decision.recommendedTier).toBe("standard");
    expect(decision.reasons[0]).toMatch(/Complex tool chain/);
  });

  it("upgrades on large context", () => {
    const decision = evaluateUpgrade({
      failureCount: 0,
      toolUseCount: 0,
      inputTokens: 5000,
      largeCodeChange: false,
      latencySensitive: false,
      previousTier: "economy",
    });

    expect(decision.recommendedTier).toBe("standard");
    expect(decision.reasons[0]).toMatch(/Large context/);
  });

  it("upgrades on large code changes", () => {
    const decision = evaluateUpgrade({
      failureCount: 0,
      toolUseCount: 0,
      inputTokens: 1000,
      largeCodeChange: true,
      latencySensitive: false,
      previousTier: "economy",
    });

    expect(decision.recommendedTier).toBe("standard");
    expect(decision.reasons[0]).toMatch(/Large code change/);
  });

  it("doesn't upgrade unnecessarily", () => {
    const decision = evaluateUpgrade({
      failureCount: 0,
      toolUseCount: 1,
      inputTokens: 1000,
      largeCodeChange: false,
      latencySensitive: false,
      previousTier: "economy",
    });

    expect(decision.recommendedTier).toBe("economy");
    expect(decision.reasons).toHaveLength(0);
  });
});

describe("budgets", () => {
  it("allows calls within budget", () => {
    const status = checkBudget(0.1, 0.2, 5.0);
    expect(status.canMakeCall).toBe(true);
  });

  it("blocks on per-call hard cap", () => {
    const status = checkBudget(1.5, 0.1, 5.0);
    expect(status.canMakeCall).toBe(false);
    expect(status.reason).toMatch(/per-call hard cap/);
  });

  it("blocks on daily hard cap", () => {
    const status = checkBudget(0.5, 1.6, 5.0);
    expect(status.canMakeCall).toBe(false);
    expect(status.reason).toMatch(/daily hard cap/);
  });

  it("reports soft cap exceeded", () => {
    const status = checkBudget(0.1, 0.5, 15.0, DEFAULT_BUDGETS);
    expect(status.dailySoftCapExceeded).toBe(true);
    expect(status.monthlySoftCapExceeded).toBe(false);
  });

  it("formats budget status correctly", () => {
    const status = checkBudget(0.1, 0.3, 10.0);
    const formatted = formatBudgetStatus(status);
    expect(formatted).toContain("Daily: $0.30");
    expect(formatted).toContain("Monthly: $10.00");
  });
});

describe("CostManager", () => {
  it("initializes with defaults", () => {
    const manager = new CostManager();
    expect(manager.getTotalSpent()).toEqual({ daily: 0, monthly: 0 });
  });

  it("selects economy tier by default", () => {
    const manager = new CostManager();
    const model = manager.selectModel({ jobId: "test" });
    expect(model).toBe("gpt-4o-mini");
  });

  it("logs calls and tracks spending", () => {
    const manager = new CostManager();
    manager.logCall({
      jobId: "test1",
      model: "gpt-4o-mini",
      inputTokens: 1000,
      estimatedOutputTokens: 1000,
      cost: 0.1,
      succeeded: true,
      timestamp: new Date().toISOString(),
    });

    const spent = manager.getTotalSpent();
    expect(spent.daily).toBeCloseTo(0.1, 2);
  });

  it("tracks failure counts", () => {
    const manager = new CostManager();
    const failingJobId = "failing-job";

    // Log two failures
    for (let i = 0; i < 2; i++) {
      manager.logCall({
        jobId: failingJobId,
        model: "gpt-4o-mini",
        inputTokens: 1000,
        estimatedOutputTokens: 500,
        cost: 0.05,
        succeeded: false,
        failureReason: "timeout",
        timestamp: new Date().toISOString(),
      });
    }

    // Next selection should upgrade to standard
    const selectedModel = manager.selectModel({ jobId: failingJobId });
    expect(selectedModel).toBe("gpt-4o");
  });

  it("enforces budget limits", () => {
    const manager = new CostManager({
      budgets: { dailyHardCap: 0.5, perCallHardCap: 0.3 },
    });

    const canProc = manager.canProceed(0.2);
    expect(canProc.allowed).toBe(true);

    const cannotProc = manager.canProceed(0.4);
    expect(cannotProc.allowed).toBe(false);
  });

  it("generates daily spend report", () => {
    const manager = new CostManager();
    manager.logCall({
      jobId: "job1",
      model: "gpt-4o-mini",
      inputTokens: 1000,
      estimatedOutputTokens: 1000,
      cost: 0.05,
      succeeded: true,
      timestamp: new Date().toISOString(),
    });

    manager.logCall({
      jobId: "job2",
      model: "gpt-4o",
      inputTokens: 1000,
      estimatedOutputTokens: 1000,
      cost: 0.15,
      succeeded: true,
      timestamp: new Date().toISOString(),
    });

    const report = manager.getDailySpend();
    expect(report).toHaveLength(2);
    expect(report[0].cost + report[1].cost).toBeCloseTo(0.2, 2);
  });
});
