# Upgrade Guide — vNEXT

<!-- bump: patch -->

## What Changed

### Browsable Stat Cards — Click Metrics to View Content

Stat cards in the Systems detail view are now interactive. When a metric maps to browsable content, clicking the card fetches and displays the actual data inline — no need to leave the dashboard or check separate endpoints.

Browsable content types include:
- **Evolution**: learnings, proposals, gaps, actions
- **Health**: coherence check results with pass/fail per check
- **Recovery**: triage history, watchdog interventions
- **Jobs**: job list
- **Telegram**: message stats

Each renders in a content panel below the metrics grid with proper formatting, tags, timestamps, and a close button.

## What to Tell Your User

Your Systems dashboard just got more useful. Those metric cards — the ones showing counts like "2 Learnings" or "Checks" — are now clickable. Tap one and it expands to show the actual content right there in the dashboard. No more switching between views to see what a number represents.

## Summary of New Capabilities

| Capability | How to Use |
|-----------|-----------|
| Browsable stat cards | Click any stat card with browsable content to expand it inline |
| Inline content panels | View learnings, proposals, health checks, and more directly in the dashboard |
