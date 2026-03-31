# Copilot CLI Runtime Handoff

Branch: `codex/copilot-cli-runtime-spike`

Goal: create a Becky/Briar-style local Instar agent backed by GitHub Copilot CLI. The intended agent name is `Betty`.

This spike intentionally stops short of claiming a finished runtime. The machine used for this branch did not have Copilot CLI installed, so the work below is limited to compile-safe plumbing plus a concrete runtime plan for the next AI to finish on a box with Copilot CLI available.

## Public docs used

- About Copilot CLI: <https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-copilot-cli>
- Configure Copilot CLI: <https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/configure-copilot-cli>
- Copilot CLI ACP server: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server>
- Copilot billing / premium requests: <https://docs.github.com/en/copilot/concepts/billing/copilot-requests>

Key documented facts as of 2026-03-29:

- Copilot CLI supports interactive and programmatic use.
- Copilot CLI exposes an ACP server over `copilot --acp --stdio`.
- The documented default model for Copilot CLI is Claude Sonnet 4.5, but GitHub reserves the right to change it.
- Paid plans include GPT-5 mini, GPT-4.1, and GPT-4o without premium-request spend. Premium models consume requests by multiplier.

## What is done

### 1. Runtime/config plumbing

Added `copilot-cli` as a recognized runtime and wired path/model config support:

- `src/core/types.ts`
- `src/core/Config.ts`
- `src/core/models.ts`

New config fields:

- `sessions.runtime = "copilot-cli"`
- `sessions.copilotPath`
- `sessions.copilotModelMap`

Runtime detection:

- `detectCopilotPath()` checks common install paths and `which copilot`

### 2. Cheap-first Copilot model mapping

Added provisional model mapping in `src/core/models.ts`:

- `haiku -> gpt-5-mini`
- `sonnet -> gpt-4.1`
- `opus -> claude-sonnet-4.5`

This is intentionally conservative and should be validated against a real Copilot CLI install tomorrow. The names are based on GitHub docs, not on a live CLI probe.

### 3. One-shot intelligence provider

Added a non-interactive Copilot CLI provider:

- `src/core/CopilotCli.ts`
- `src/core/CopilotCliIntelligenceProvider.ts`

This is meant for lightweight internal judgments only:

- classification
- reflection
- relationship heuristics
- other `IntelligenceProvider` use sites

It uses `copilot --model <model> --prompt <text>` and does not attempt persistent session management.

### 4. Server / reflect integration

Wired Copilot CLI into the existing intelligence-provider selection path:

- `src/commands/server.ts`
- `src/commands/reflect.ts`

Current selection behavior is:

- if runtime is `copilot-cli` and `copilotPath` exists, prefer `CopilotCliIntelligenceProvider`
- else if runtime is `codex-cli`, prefer `CodexCliIntelligenceProvider`
- else prefer `ClaudeCliIntelligenceProvider`
- else fall back to Anthropic API when available

### 5. Explicit guard for unfinished persistent runtime

`SessionManager` now fails clearly if someone tries to run persistent tmux sessions with `sessions.runtime = "copilot-cli"` before the ACP worker exists:

- `src/core/SessionManager.ts`

Current error:

`copilot-cli tmux runtime is not implemented yet. See docs/COPILOT-CLI-RUNTIME-HANDOFF.md.`

That is intentional. It avoids silently falling back to Claude.

### 6. Tests

Added source-level coverage for the model mapping:

- `tests/unit/cost-awareness.test.ts`

This branch should still compile with `npm run lint`.

## What is not done

### 1. Persistent Copilot session runtime

This is the main missing piece.

Instar sessions for Becky/Briar depend on:

- long-lived local sessions
- message injection into a living conversation
- resume/handoff across restarts
- runtime-native session IDs persisted to state

For Copilot CLI, the correct architecture is almost certainly ACP-backed, not tmux text injection into the raw interactive CLI.

### 2. Copilot ACP session worker

No `CopilotSessionWorker.ts` has been added yet.

That worker should mirror the role of `src/runtime/CodexSessionWorker.ts`, but use ACP:

1. spawn `copilot --acp --stdio`
2. initialize ACP connection
3. create a session with `cwd`
4. persist the ACP `sessionId` to a state file
5. accept injected prompts from stdin
6. stream or collect agent output
7. answer permission requests in a controlled way

### 3. Approval policy

This needs a real decision before Betty is safe to run unattended.

Open design question:

- always allow everything inside a trusted workspace
- allow a curated tool list only
- deny by default and only use Copilot for analysis/judgment

GitHub docs say Copilot CLI supports trusted directories, allowed tools, paths, and URLs. The next AI should validate whether those can be controlled cleanly enough for unattended Instar use.

### 4. Resume integration

`TopicResumeMap` and the existing runtime resume plumbing currently support:

- Claude hook UUIDs
- Codex worker session IDs

Betty needs the ACP `sessionId` persisted and reloaded so Telegram topics can survive restarts the same way Briar does.

### 5. Runtime-specific readiness detection

`waitForClaudeReady()` and the current prompt/readiness heuristics are Claude/Codex-shaped. Copilot ACP will need its own ready semantics.

### 6. Cost telemetry

The current Copilot work only maps cheap-first models. It does not yet account for:

- premium request multipliers
- included-model vs premium-model routing
- monthly budget or soft cap
- dashboard surfacing for Copilot spend / request burn

## Recommended next implementation plan

### Phase 1: validate the CLI

On a machine with Copilot CLI installed:

1. `copilot auth login`
2. `copilot --version`
3. `copilot --model gpt-5-mini --prompt "Reply with OK"`
4. `copilot --model gpt-4.1 --prompt "Reply with OK"`
5. `copilot --acp --stdio`

Questions to answer immediately:

- Are the provisional model IDs accepted exactly as written?
- Does `--prompt` produce plain stdout suitable for `IntelligenceProvider` calls?
- Does ACP expose a stable `sessionId` that survives multiple prompts in one worker process?

### Phase 2: build the ACP worker

Create:

- `src/runtime/CopilotSessionWorker.ts`

Suggested shape:

- spawn `copilot --acp --stdio`
- maintain one ACP session per tmux worker
- use the ACP `sessionId` as `runtimeSessionId`
- write state to `.instar/state/copilot-sessions/<tmux>.json`

### Phase 3: wire SessionManager runtime

Update `src/core/SessionManager.ts`:

- add `requireCopilotPath()`
- add `copilotWorkerPath()`
- add runtime branch in:
  - `spawnSession`
  - `spawnInteractiveSession`
  - `spawnTriageSession`
- add runtime-specific ready marker handling
- add runtime-specific state-file lookup similar to Codex

### Phase 4: resume and dashboard parity

Update:

- `src/core/TopicResumeMap.ts`
- `src/commands/server.ts`
- `src/server/routes.ts`

Goal:

- preserve ACP `sessionId`
- let Telegram topics resume Betty sessions
- show `copilot-cli` clearly in dashboard/runtime metadata

### Phase 5: cost controls

Add Copilot-specific cost policy:

- default `haiku` to included/free-tier-on-paid-plan model
- escalate to `sonnet` only when necessary
- use premium models only on explicit escalation or retry

Likely file to add:

- `src/core/CopilotCostAwareness.ts`

or extend the existing cost routing abstraction once the runtime is real.

## Suggested validation checklist for tomorrow

After Phase 2/3:

1. Start a test agent with `sessions.runtime = "copilot-cli"`
2. Send a Telegram message
3. Confirm a tmux session spawns
4. Confirm message injection reaches Copilot worker
5. Confirm reply returns to Telegram
6. Restart the service
7. Confirm the session resumes into the same topic
8. Run one scheduled job on `haiku`
9. Escalate one task manually to `sonnet`
10. Verify dashboard labeling is truthful

## Files touched in this spike

- `src/core/types.ts`
- `src/core/Config.ts`
- `src/core/models.ts`
- `src/core/CopilotCli.ts`
- `src/core/CopilotCliIntelligenceProvider.ts`
- `src/core/SessionManager.ts`
- `src/commands/server.ts`
- `src/commands/reflect.ts`
- `src/server/routes.ts`
- `src/index.ts`
- `tests/unit/cost-awareness.test.ts`

## One important caution

Do not mistake GitHub's "Copilot coding agent" for the right backend here.

That feature is PR/GitHub Actions oriented and is a poor fit for an always-on local Telegram agent. Betty should be built on `Copilot CLI` plus ACP, not on GitHub's repository-assigned coding agent workflow.
