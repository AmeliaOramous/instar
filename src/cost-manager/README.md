# CostManager: Model Cost Tracking & Intelligent Tier Selection

A minimal-viable cost management system for AI agents that tracks spending, learns when to upgrade models, and enforces budgets.

## Overview

**Problem:** AI agents can call multiple models (gpt-4o-mini, gpt-4o, gpt-4x) with vastly different costs. Without visibility and control, costs spiral.

**Solution:** CostManager provides:
- 📊 **Cost tracking** — per-model, per-job attribution
- 🧠 **Smart upgrades** — rule-based heuristics (failures, tool use, context size) + bandit learning
- 💰 **Budget enforcement** — soft/hard caps with graceful degradation
- 📈 **Reporting** — daily/weekly summaries with per-job breakdowns

## Architecture

```
CostManager
├── pricing.ts       — Model costs, tier mappings
├── heuristics.ts    — Rule-based upgrade decisions
├── budgets.ts       — Soft/hard cap enforcement
└── cost-manager.ts  — Main class, coordinates everything
```

## Usage

### Basic Setup

```typescript
import { CostManager } from "./cost-manager.js";

const manager = new CostManager({
  defaultTier: "economy",
  budgets: {
    dailySoftCap: 0.5,
    monthlySoftCap: 15.0,
    perCallHardCap: 1.0,
    dailyHardCap: 2.0,
  },
});
```

### Select Model for a Job

```typescript
const model = manager.selectModel({
  jobId: "parking-lot-digest",
  inputTokens: 3500,
  toolUseCount: 2,
  largeCodeChange: false,
  latencySensitive: false,
});
// Returns: "gpt-4o-mini" (economy) or "gpt-4o" (standard) based on heuristics
```

### Estimate Cost

```typescript
const estimatedCost = manager.estimateCost("gpt-4o-mini", 3500, 1000);
// Returns: ~$0.07
```

### Check Budget

```typescript
const { allowed, status } = manager.canProceed(0.1);
if (!allowed) {
  console.log("Budget exceeded:", status.reason);
}
```

### Log Results

```typescript
manager.logCall({
  jobId: "parking-lot-digest",
  model: "gpt-4o-mini",
  inputTokens: 3500,
  outputTokens: 1247, // actual
  estimatedOutputTokens: 1000, // predicted
  cost: 0.068,
  succeeded: true,
  timestamp: new Date().toISOString(),
});
```

### Get Reports

```typescript
const daily = manager.getDailySpend();
// [
//   { model: "gpt-4o-mini", cost: 0.18, callCount: 3 },
//   { model: "gpt-4o", cost: 0.32, callCount: 1 },
// ]

const status = manager.getBudgetStatus();
// { dailySpent: 0.5, monthlySent: 10.2, dailySoftCapExceeded: true, ... }
```

## Tier Defaults

| Tier | Model | Input Cost | Output Cost |
|------|-------|-----------|------------|
| **Economy** | gpt-4o-mini | $0.15/1M | $0.60/1M |
| **Standard** | gpt-4o | $2.50/1M | $10/1M |
| **High** | gpt-4x | $30/1M | $60/1M |

## Upgrade Heuristics (Phase 1)

Auto-upgrade from **economy → standard** when:

- **Repeated failures** — task failed 2+ times on economy
- **Complex tool use** — 3+ tools or long tool chains
- **Large context** — >4,000 input tokens
- **Large code changes** — diffs >500 lines
- **Latency sensitive** — time-critical tasks

No automatic **standard → high** upgrades; reserved for explicitly marked critical paths.

## Budget Enforcement

| Limit | Behavior |
|-------|----------|
| `dailySoftCap` ($0.50) | Warn + suggest downgrade in logs |
| `monthlySoftCap` ($15) | Include in summaries; warn if trending |
| `perCallHardCap` ($1.00) | Skip call or chunk to smaller context |
| `dailyHardCap` ($2.00) | Block all non-emergency jobs |

## Phase 2: Bandit Learning (Future)

Once heuristics are collecting signals, implement multi-armed bandit exploration:

- **Explore** — 1 in 10 eligible calls try a higher tier (ε=0.1)
- **Observe** — log success/failure + latency for each exploration
- **Reward** — if higher tier succeeds where economy fails, or 30% faster, increase weight
- **Cap** — max 5 explorations/day; never exceed hard ceiling

## Testing

```bash
npm test -- cost-manager.test.ts
```

Tests cover:
- ✅ Pricing calculations
- ✅ Upgrade heuristics
- ✅ Budget checks
- ✅ Budget status formatting
- ✅ CostManager integration

## Integration with Scheduler

CostManager is designed to integrate with instar's scheduler hooks:

1. **PreExecution** — select tier via `selectModel()`
2. **PreExecution** — check budget via `canProceed()`
3. **PostExecution** — log results via `logCall()`
4. **Daily** — report via `getDailySpend()` → Telegram

## Configuration

All settings are tunable at construction time:

```typescript
new CostManager({
  defaultTier: "standard", // or "economy", "high"
  enableExploration: true, // Phase 2 feature
  budgets: {
    dailySoftCap: 1.0,
    monthlySoftCap: 30.0,
    perCallHardCap: 2.0,
    dailyHardCap: 5.0,
  },
});
```

## Future Enhancements

- [ ] Bandit exploration + per-task-family reward tracking
- [ ] Dashboard visualization (cost trends, per-feature charts)
- [ ] Provider-agnostic pricing (Claude, OpenAI, etc.)
- [ ] Pricing auto-update (fetch from APIs, warn on drift)
- [ ] Admin commands (`/cost-report`, `/upgrade-next-job`)
- [ ] Cost attribution by feature/module
