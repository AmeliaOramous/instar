# RFC: Model Cost Management for Instar

**Date:** 2026-03-29
**Status:** Draft
**Upstream:** JKHeadley/instar

## Motivation

Instar agents can call multiple AI models (gpt-4o-mini, gpt-4o, gpt-4x) with vastly different costs. Without visibility and control, cost can spiral. This RFC proposes a minimal-viable cost management system that:

1. **Tracks spend** — per-model, per-job, per-feature cost attribution
2. **Learns when to upgrade** — bandit-based exploration to find the minimal-cost model for each task
3. **Enforces budgets** — soft/hard caps with graceful degradation
4. **Reports clearly** — daily/weekly summaries with per-job breakdowns

## Goals

- **Minimal viable cost** — default to economy tier (gpt-4o-mini)
- **Learn over time** — bandit exploration (1-in-10 eligible calls, 5/day cap) to discover when higher tiers are worth it
- **Transparent reporting** — daily spend summaries + per-job attribution
- **Non-breaking** — backward-compatible; cost management is opt-in per agent

## Design

### Tier Defaults (Tunable)

```
economy   → gpt-4o-mini   (~$0.15/1M input, $0.60/1M output)
standard  → gpt-4o        (~$2.50/1M input, $10/1M output)
high      → gpt-4x        (~$30/1M input, $60/1M output)
```

### Cost Estimation

Public pricing map in code (updated quarterly):

```json
{
  "gpt-4o-mini": { "in": 0.15, "out": 0.60 },
  "gpt-4o": { "in": 2.50, "out": 10 },
  "gpt-4x": { "in": 30, "out": 60 }
}
```

Predicted cost = (input_tokens/1M) * pricing.in + (output_tokens/1M) * pricing.out

### Upgrade Heuristics (Rule-Based Phase 1)

Auto-upgrade from economy → standard when:
- **Repeated failures** — task failed 2+ times on economy model
- **Tool use** — complex tool chains (3+ tools) or long context (>4K input tokens)
- **Latency pressure** — if predicted execution time > timeout window
- **Large diffs** — code changes with >500 line churn

Auto-upgrade standard → high: reserved for explicitly marked critical paths

### Learning Phase 2 (Bandit)

Once rule-based upgrades are logging signals:

- **Explore** — on 1 in 10 eligible calls (ε=0.1), try a higher tier
- **Observe** — log success/failure + time/cost for each upgrade experiment
- **Reward** — if higher tier succeeds where economy fails, or completes 30% faster, increase exploration weight
- **Cap** — max 5 explorations/day; never exceed hard ceiling (e.g., $1 per call)

### Budgets & Enforcement

Soft caps (warn, suggest downgrade):
```
daily_soft:  $0.50 (if exceeded, warn in logs; next job defaults to economy)
monthly_soft: $15  (if exceeded, summary includes "trending over budget")
```

Hard caps (block):
```
per_call:  $1.00 (predicted cost > $1 → skip or chunk)
daily_hard: $2.00 (if exceeded, block all but emergency jobs)
```

### Reporting

**Daily Summary** (6pm, sent to Telegram):
```
📊 Daily Spend (2026-03-29):
- gpt-4o-mini: 8 calls, $0.18
- gpt-4o: 2 calls, $0.32
- gpt-4x: 0 calls, $0

Total: $0.50 (soft cap: $0.50)
Top job: cost-manager-debug ($0.22)
```

**Weekly** (Sunday 6pm):
- Per-feature breakdown (Model Cost Management, Parking Lot Digests, etc.)
- Exploration outcomes (% success on upgrades)
- Cost trend vs. prior weeks

## Implementation

### Phase 1 (This PR)

1. **CostManager module** — estimation, heuristics, budget checks
2. **Scheduler hooks** — select tier before each job
3. **Logging** — per-call cost + model selection + failure signals
4. **Tests** — unit tests for heuristics + budget enforcement

### Phase 2 (Follow-up)

1. **Bandit exploration** — experiment tracking + reward function
2. **Dashboard** — cost trends, per-feature charts
3. **Admin commands** — `/cost-report`, `/upgrade-next-job` override

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Exploration overspends | Hard cap $1/call + 5/day limit |
| Models unavailable | Fallback chain (4x → o1 → 4o-turbo) |
| Pricing drifts | Quarterly review; alerts if off >10% |
| Budget pressure kills velocity | Soft caps warn first; hard caps only on actual overages |

## Questions for Upstream

1. Should this live in instar core or as an example agent module?
2. Do you want a provider-agnostic pricing map (Claude, OpenAI, etc.)?
3. Any existing cost tracking we should integrate with?

## References

- Parent repo: https://github.com/JKHeadley/instar
- Bandit algorithms: Multi-Armed Bandit Problem (ε-greedy strategy)
- Cost per model: OpenAI pricing (March 2026)
