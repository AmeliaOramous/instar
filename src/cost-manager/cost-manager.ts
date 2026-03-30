/**
 * CostManager: Main class for cost tracking and model selection
 * Coordinates pricing, heuristics, and budget enforcement
 */

import { estimateCost, getTierModel, ModelTier } from "./pricing.js";
import { evaluateUpgrade, UpgradeSignals } from "./heuristics.js";
import { checkBudget, BudgetLimits, BudgetStatus, DEFAULT_BUDGETS } from "./budgets.js";

export interface CallMetrics {
  jobId: string;
  model: string;
  inputTokens: number;
  outputTokens?: number;
  estimatedOutputTokens: number;
  cost: number;
  succeeded: boolean;
  failureReason?: string;
  timestamp: string;
}

export interface CostManagerConfig {
  budgets?: Partial<BudgetLimits>;
  defaultTier?: ModelTier;
  enableExploration?: boolean;
}

type SelectModelSignals = Partial<UpgradeSignals> & {
  jobId?: string;
};

/**
 * CostManager tracks and manages model costs
 */
export class CostManager {
  private budgets: BudgetLimits;
  private defaultTier: ModelTier;
  private enableExploration: boolean;
  private dailySpent: number = 0;
  private monthlySpent: number = 0;
  private callLog: CallMetrics[] = [];
  private failureLog: Map<string, number> = new Map(); // job -> failure count

  constructor(config: CostManagerConfig = {}) {
    this.budgets = { ...DEFAULT_BUDGETS, ...config.budgets };
    this.defaultTier = config.defaultTier ?? "economy";
    this.enableExploration = config.enableExploration ?? false;
  }

  /**
   * Select the appropriate model tier for a job
   */
  selectModel(signals: SelectModelSignals): string {
    const fullSignals: UpgradeSignals = {
      failureCount: signals.failureCount ?? (this.failureLog.get(signals.jobId ?? "") ?? 0),
      toolUseCount: signals.toolUseCount ?? 0,
      inputTokens: signals.inputTokens ?? 0,
      largeCodeChange: signals.largeCodeChange ?? false,
      latencySensitive: signals.latencySensitive ?? false,
      previousTier: this.defaultTier,
    };

    const decision = evaluateUpgrade(fullSignals);
    return getTierModel(decision.recommendedTier);
  }

  /**
   * Estimate cost for a call
   */
  estimateCost(
    model: string,
    inputTokens: number,
    estimatedOutputTokens: number
  ): number {
    return estimateCost(model, inputTokens, estimatedOutputTokens);
  }

  /**
   * Check if a call can proceed within budget limits
   */
  canProceed(estimatedCost: number): { allowed: boolean; status: BudgetStatus } {
    const status = checkBudget(estimatedCost, this.dailySpent, this.monthlySpent, this.budgets);
    return { allowed: status.canMakeCall, status };
  }

  /**
   * Log a completed call
   */
  logCall(metrics: CallMetrics): void {
    this.callLog.push(metrics);
    this.dailySpent += metrics.cost;
    this.monthlySpent += metrics.cost;

    if (!metrics.succeeded) {
      const current = this.failureLog.get(metrics.jobId) ?? 0;
      this.failureLog.set(metrics.jobId, current + 1);
    } else {
      this.failureLog.set(metrics.jobId, 0);
    }
  }

  /**
   * Get daily spend report
   */
  getDailySpend(): { model: string; cost: number; callCount: number }[] {
    const byModel = new Map<string, { cost: number; count: number }>();

    for (const call of this.callLog) {
      const entry = byModel.get(call.model) ?? { cost: 0, count: 0 };
      entry.cost += call.cost;
      entry.count += 1;
      byModel.set(call.model, entry);
    }

    return Array.from(byModel.entries()).map(([model, data]) => ({
      model,
      cost: data.cost,
      callCount: data.count,
    }));
  }

  /**
   * Reset daily tracking (call at midnight)
   */
  resetDaily(): void {
    this.dailySpent = 0;
    this.callLog = this.callLog.filter((call) => {
      const callDate = new Date(call.timestamp).toDateString();
      const today = new Date().toDateString();
      return callDate === today;
    });
  }

  /**
   * Get current budget status
   */
  getBudgetStatus(): BudgetStatus {
    return checkBudget(0, this.dailySpent, this.monthlySpent, this.budgets);
  }

  /**
   * Get the total spent so far
   */
  getTotalSpent(): { daily: number; monthly: number } {
    return { daily: this.dailySpent, monthly: this.monthlySpent };
  }
}
