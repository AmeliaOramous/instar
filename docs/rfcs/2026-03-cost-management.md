# RFC: Model Cost Management

Goal: upstream a first-class cost management layer to Instar to control spend without sacrificing capability.

## Scope (v1)
- Unified cost map for models (OpenAI/Anthropic/etc.)
- Cost-aware client wrapper that logs usage and estimates cost per call
- Tiering + downgrade rules (High/Standard/Economy → concrete model names)
- Budgets: monthly + daily soft limits
- Enforcements: warn → auto-downgrade → block (configurable)
- Reporting: daily/weekly Telegram summary + per-job attribution

## Config
- `config/model-costs.ts` – source of truth (per-1k token $ and updated models)
- `.instar/config.json` – user overrides (budgets, preferred tiers)
- Env overrides: `MODEL_TIER_DEFAULT`, `BUDGET_MONTHLY`, `BUDGET_DAILY_SOFT`

## API (TS)
```ts
export type ModelTier = 'high' | 'standard' | 'economy'
export interface CostEnvelope { promptTokens: number; completionTokens: number; costUSD: number }
export interface CostManagerOptions { budgetMonthly?: number; budgetDailySoft?: number; defaultTier?: ModelTier }
export class CostManager {
  constructor(opts?: CostManagerOptions)
  chooseModel(task: string, tier?: ModelTier): string // maps to concrete model
  willExceedBudget(estimateUSD: number): boolean
  record(span: { task: string; model: string; usage: CostEnvelope; meta?: any }): void
  report(period: 'daily'|'weekly'): string // text report
}
```

## Integration points
- Scheduler: pick tier per job; block/downgrade if nearing budget
- Messaging jobs: default to economy; allow per-topic overrides
- PR assistant: economy by default (configurable)

## v2 Ideas
- Persist per-job cost to SQLite for long‑term analytics
- Multi-provider support (OpenRouter, Groq) via adapters
- Project budgets per repo / per owner

## Open Questions
- Default monthly budget and downgrade policy?
- Preferred tiers mapping (e.g., high=gpt-4o, standard=gpt-4o-mini)
- Reporting targets (Telegram topics per owner?)

```diff
+ Deliverables (this PR)
+ 1) cost-manager module (TS) + unit tests
+ 2) scheduler hooks to consult CostManager
+ 3) wiring for PR assistant + default tiers
+ 4) docs + examples
```
