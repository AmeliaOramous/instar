/**
 * Budget enforcement and soft/hard cap management
 */

export interface BudgetLimits {
  // Soft caps: warn and suggest downgrades
  dailySoftCap: number; // USD per day
  monthlySoftCap: number; // USD per month

  // Hard caps: block or skip
  perCallHardCap: number; // USD per call
  dailyHardCap: number; // USD per day
}

export const DEFAULT_BUDGETS: BudgetLimits = {
  dailySoftCap: 0.5,
  monthlySoftCap: 15.0,
  perCallHardCap: 1.0,
  dailyHardCap: 2.0,
};

export interface BudgetStatus {
  dailySpent: number;
  monthlySpent: number;
  dailySoftCapExceeded: boolean;
  monthlySoftCapExceeded: boolean;
  canMakeCall: boolean;
  reason?: string;
}

/**
 * Check if a call is within budget limits
 */
export function checkBudget(
  estimatedCost: number,
  dailySpent: number,
  monthlySpent: number,
  limits: BudgetLimits = DEFAULT_BUDGETS
): BudgetStatus {
  const dailySoftCapExceeded = dailySpent >= limits.dailySoftCap;
  const monthlySoftCapExceeded = monthlySpent >= limits.monthlySoftCap;

  // Hard cap: per-call
  if (estimatedCost > limits.perCallHardCap) {
    return {
      dailySpent,
      monthlySpent,
      dailySoftCapExceeded,
      monthlySoftCapExceeded,
      canMakeCall: false,
      reason: `Predicted cost $${estimatedCost.toFixed(2)} exceeds per-call hard cap $${limits.perCallHardCap}`,
    };
  }

  // Hard cap: daily
  if (dailySpent + estimatedCost > limits.dailyHardCap) {
    return {
      dailySpent,
      monthlySpent,
      dailySoftCapExceeded,
      monthlySoftCapExceeded,
      canMakeCall: false,
      reason: `Daily spend would be $${(dailySpent + estimatedCost).toFixed(2)}, exceeds hard cap $${limits.dailyHardCap}`,
    };
  }

  return {
    dailySpent,
    monthlySpent,
    dailySoftCapExceeded,
    monthlySoftCapExceeded,
    canMakeCall: true,
  };
}

/**
 * Format budget status for logging
 */
export function formatBudgetStatus(status: BudgetStatus, limits: BudgetLimits = DEFAULT_BUDGETS): string {
  const lines: string[] = [];

  lines.push(`Daily: $${status.dailySpent.toFixed(2)}/$${limits.dailySoftCap} (soft)`);
  if (status.dailySoftCapExceeded) {
    lines.push("  ⚠️ Daily soft cap exceeded");
  }

  lines.push(`Monthly: $${status.monthlySpent.toFixed(2)}/$${limits.monthlySoftCap} (soft)`);
  if (status.monthlySoftCapExceeded) {
    lines.push("  ⚠️ Monthly soft cap exceeded");
  }

  if (!status.canMakeCall) {
    lines.push(`  ❌ ${status.reason}`);
  }

  return lines.join("\n");
}
