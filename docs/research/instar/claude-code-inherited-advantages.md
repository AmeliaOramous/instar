# Instar x Claude Code: Inherited Advantages

> What every Instar agent gets for free — automatically, invisibly — just by running inside Claude Code. And how Instar multiplies each advantage into something neither could achieve alone.

## What the User Experiences

None of this. The user talks to an AI agent — through Telegram, or whatever interface they prefer. They say what they need. The agent does it. That's the entire experience.

The agent remembers what it learned last week. It runs jobs while the user sleeps. It creates its own tools when it needs them. It manages its own costs, protects itself from mistakes, and gets better over time. The user doesn't configure any of this. They don't know Claude Code exists. They don't manage hooks, skills, subagents, or context windows. They have a competent AI partner that works alongside them — and the partnership deepens with every interaction.

Everything below explains *how* that experience is possible. But the experience itself is simple: **you talk to your agent, and it just works.**

## The Core Insight

Instar agents run inside **real Claude Code sessions**. Not an API wrapper. Not a proxy. The actual `claude` CLI process, with all its capabilities. This means every feature Anthropic ships for Claude Code is immediately available to every Instar agent — zero integration work, zero maintenance burden.

**The user never interacts with Claude Code.** They talk to their agent through Telegram (or any future interface). The agent handles everything conversationally. But under the hood, the full power of Claude Code is doing the work.

**The multiplication principle:** Each Claude Code feature is valuable on its own. But Instar doesn't just inherit these features — it wraps them in infrastructure that makes them dramatically more effective. Claude Code provides the raw capability; Instar provides the context, persistence, and behavioral scaffolding that turns capability into coherent autonomous agency.

---

## Automatic Advantages (Zero Configuration, Zero User Interaction)

These capabilities are inherited by every Instar agent without the user doing anything. They're invisible infrastructure that makes agents dramatically more capable than they would be through raw API access.

### 1. Prompt Caching (Automatic Cost Optimization)

**What it does:** Claude Code automatically caches conversation prefixes. When an agent has a long conversation or repeated patterns, subsequent turns reuse cached content instead of re-processing it.

**Why it matters for Instar agents:**
- Cache reads cost **90% less** than fresh processing
- Long-running autonomous sessions (common for Instar jobs) benefit enormously — the identity files, CLAUDE.md, and accumulated context get cached and reused across every turn
- Job sessions that share similar prompts benefit from cross-turn caching
- **No configuration needed** — Claude Code manages cache breakpoints automatically, moving them forward as conversations grow

**How Instar amplifies this:** Instar generates a rich, stable CLAUDE.md during init — agent identity, behavioral guidelines, project structure, anti-patterns. This content sits at the top of every conversation, forming the perfect caching prefix. Session-start hooks inject consistent identity content. Job prompts follow predictable patterns. All of this is highly cacheable by design, which means Instar agents get disproportionately better cache hit rates than ad-hoc Claude Code usage. The architecture is inherently cache-friendly.

**What this would cost to build yourself:** Custom caching layer on top of the API, cache invalidation logic, breakpoint management. Significant engineering effort and ongoing maintenance.

### 2. Auto-Compaction (Infinite Session Length)

**What it does:** When context approaches 98% of the window limit, Claude Code automatically summarizes older conversation history while preserving critical information. The session continues without interruption.

**Why it matters for Instar agents:**
- Agents can run for hours without hitting context limits
- Autonomous jobs don't crash mid-task because they ran out of context
- The user never sees or manages this. Their agent just... keeps working.

**How Instar amplifies this:** This is the clearest example of multiplication. Auto-compaction is useful but also one of the **biggest threats to agent coherence** — when context is summarized, the agent can lose track of who it is, what it was doing, and what it's learned. Instar solves this with multiple reinforcing layers:

- **compaction-recovery.sh** — A hook that fires automatically on compaction and re-injects the *full content* of AGENT.md and MEMORY.md directly into context. Not file references — the actual text. The agent immediately knows who it is again.
- **MEMORY.md persistence** — The agent's accumulated learnings live in a file that survives compaction. The hook re-injects the most important lines; the full file remains readable.
- **session-start.sh** — Re-orients the agent on every session start with identity, capabilities, and current job context.
- **active-job.json** — When running a scheduled job, the job's context (slug, name, purpose, grounding requirements) is persisted to file. After compaction, the hook reads this and re-injects job-specific grounding.
- **Telegram message history** — The highest-level coherence record. Even after multiple compactions, the full Telegram conversation thread exists as an external log. The agent can read its own JSONL message history to reconstruct what happened across compaction boundaries. This is coherence that lives *outside* the context window entirely.

Without Instar's amplification, compaction means "the session continues but the agent might be confused." With it, compaction means "the session continues and the agent knows exactly who it is and what it's doing."

**What this would cost to build yourself:** Custom conversation truncation/summarization, state management across summaries, identity persistence layer, external coherence logging. One of the hardest problems in agent engineering — and it's handled automatically.

### 3. Extended Thinking

**What it does:** Claude models can engage in longer internal reasoning before responding. This produces better answers for complex tasks — multi-step analysis, debugging, architectural decisions.

**Why it matters for Instar agents:**
- Job tasks that require complex reasoning (code review, debugging, research synthesis) get better results automatically
- The agent thinks more deeply without the user needing to ask for it
- Available on Opus and Sonnet model families — Instar selects the appropriate model per job

**How Instar amplifies this:** Extended thinking is more effective when the model has rich context to reason against. Instar's identity files (AGENT.md, USER.md, MEMORY.md) give the model deep understanding of who it is, who it serves, and what it's learned — making extended thinking about the agent's domain, not just the immediate task. Combined with per-job model selection, Instar routes complex jobs to Opus (best extended thinking) and routine jobs to Sonnet (fast, cheaper), optimizing both quality and cost.

**What this would cost to build yourself:** Not available through raw API without specific configuration. Claude Code handles the thinking budget and integration transparently.

### 4. Automatic Checkpoint & Rollback System

**What it does:** Before every file edit, Claude Code snapshots the file contents. If something goes wrong, the entire change can be reverted.

**Why it matters for Instar agents:**
- Autonomous agents making file changes have a safety net — bad edits don't destroy work
- The user's codebase is protected even when the agent operates unsupervised

**How Instar amplifies this:** Checkpoints are **reactive** safety — they protect *after* something goes wrong. Instar adds **proactive** safety through a layered defense system built on Claude Code's PreToolUse hooks:

1. **Catastrophic commands are always blocked** — `rm -rf /`, fork bombs, disk wipes are intercepted and rejected regardless of configuration. No amount of self-verification can undo these.

2. **Risky commands follow the safety level progression** — Commands like `git push --force`, `DROP TABLE`, `git reset --hard` are handled based on the agent's configured safety level:
   - **Level 1 (default):** The command is blocked and the agent is told to ask the user for confirmation. Human stays in the loop.
   - **Level 2 (autonomous):** Instead of blocking, the hook injects a **self-verification prompt** as `additionalContext`. The agent must reason through a checklist — *Is this necessary? What are the consequences? Is there a safer alternative? Does this align with my principles?* — before the command proceeds. The agent self-checks rather than deferring to the user.

3. **Checkpoints provide the final safety net** — If the self-verification passes but the result is still wrong, Claude Code's checkpoint system allows rollback.

This creates **three-layer defense in depth**: catastrophic commands are structurally impossible, risky commands require intelligent verification (human or self), and file changes are always reversible. Together, autonomous agents can work unsupervised with genuine safety guarantees — not because they're restricted, but because they're structurally self-aware.

**Configuration:** `safety.level` in `.instar/config.json`. Default is 1 (ask user). Set to 2 when the agent is ready for autonomous self-verification.

**What this would cost to build yourself:** File versioning system, snapshot management, rollback logic, command classification, configurable blocking/self-verification pipeline. Every agent framework that touches files needs this; Instar gets the checkpoint layer free and adds the active guard with safety level progression on top.

### 5. Built-In Web Search & Web Fetch

**What it does:** Claude Code has native `WebSearch` and `WebFetch` tools that work without any MCP server or API key configuration.

**Why it matters for Instar agents:**
- Agents can research topics, check current information, fetch documentation — all conversationally
- No need to set up Brave, Tavily, or any third-party search API
- The agent decides when to search based on the task at hand
- Results are automatically integrated into the agent's reasoning

**How Instar amplifies this:** Through CLAUDE.md and skills, Instar can encode research patterns, trusted sources, and domain-specific search strategies. The agent doesn't just search blindly — it searches with the context of who it is and what domain it operates in. Job definitions can include research phases, and skills can wrap multi-step research workflows. The user says "research X" in Telegram; the agent decides how to search, what to fetch, and synthesizes the results — all conversationally.

**What this would cost to build yourself:** Search API subscription, integration code, result parsing, rate limiting. Many agent frameworks charge extra for web access or require manual setup.

### 6. Native File System Intelligence

**What it does:** Claude Code provides optimized tools for file operations: `Read`, `Write`, `Edit`, `Glob` (pattern matching), `Grep` (content search). These are purpose-built for code and text manipulation.

**Why it matters for Instar agents:**
- Agents navigate codebases efficiently — finding files by pattern, searching content by regex
- Edits are precise (find-and-replace with context) rather than whole-file rewrites
- The agent can explore, understand, and modify any project the user points it at
- All of this happens naturally through conversation — the user says "update the config" and the agent reads, understands, and edits the right files

**How Instar amplifies this:** CLAUDE.md provides a project map so the agent knows *where* to look before searching. MEMORY.md accumulates file knowledge across sessions — which config files matter, which patterns to follow, which directories contain what. Over time, the agent gets faster and more precise because it remembers the codebase layout from previous sessions. The user's project becomes the agent's home territory, not an unfamiliar landscape every time.

**What this would cost to build yourself:** Custom file tools, search indexing, diff-based editing, persistent project knowledge. Most API-based agents do whole-file rewrites because they lack Claude Code's surgical `Edit` tool.

### 7. Bash Execution (Full System Access)

**What it does:** Claude Code can execute arbitrary shell commands, read their output, and act on results.

**Why it matters for Instar agents:**
- Agents can run tests, build projects, manage processes, interact with APIs via curl, manage git — anything a developer can do in a terminal
- The agent chains commands intelligently: build, test, fix, re-test

**How Instar amplifies this:** Raw bash access is powerful but unstructured. Instar turns it into **accumulating infrastructure**. As the agent works, it naturally creates scripts in `.claude/scripts/` for operations it performs repeatedly — API integrations, deployment workflows, data processing pipelines, health checks. These scripts persist across sessions via the project filesystem. The agent writes them once, then calls them by name in future sessions. Over time, the agent builds its own toolbox — not because someone programmed it, but because it recognized the pattern and automated it. Combined with MEMORY.md (which remembers which scripts exist and what they do), bash execution evolves from "run arbitrary commands" to "orchestrate a growing library of self-authored automation." The agent's bash capabilities compound with every session.

**What this would cost to build yourself:** Sandboxed execution environment, output parsing, error handling, script persistence layer. Many agent platforms severely limit or don't offer shell access at all — and none of them produce agents that build their own tooling over time.

### 8. Subagent Spawning (Parallel Work)

**What it does:** Claude Code's `Task` tool spawns isolated worker agents that run in parallel with the main session. Each subagent gets a fresh context window and returns a summary.

**Why it matters for Instar agents:**
- Complex tasks can be parallelized: research one thing while implementing another
- Subagent work doesn't consume the main session's context window
- Results are summarized back, keeping the main session focused

**How Instar amplifies this:** The user never sees any of this. They send a message like "research competitors and update the landing page" — and the agent silently spawns parallel workers: one researching competitors via web search, another reading the current landing page, a third drafting copy. The results converge back into the main session, and the user gets a single coherent response. They don't know subagents exist. They don't manage them. They just get faster, deeper results than a single-threaded agent could produce.

Under the hood, Instar's CLAUDE.md and project context automatically propagate to every subagent through Claude Code's discovery mechanism. Subagents inherit the agent's identity, project awareness, and conventions — they're not blind workers, they're contextually aware collaborators that speak with the same voice. Custom agent definitions can specialize subagents for particular domains. But none of this complexity surfaces to the user. They talk to one agent. That agent orchestrates an entire team invisibly.

**What this would cost to build yourself:** Multi-agent orchestration, context isolation, context propagation, result aggregation, parallel execution management. This is the core unsolved challenge of multi-agent systems — and it works invisibly out of the box.

### 9. Token Tracking & Cost Visibility

**What it does:** Claude Code automatically tracks all token usage — input, output, cache reads, cache writes — per session and per request.

**Why it matters for Instar agents:**
- The user gets real cost data, not estimates
- Usage data is available per session and per request

**How Instar amplifies this:** Raw token tracking becomes **intelligent cost governance**. Instar's quota-aware scheduler reads Claude Code's usage data and makes autonomous decisions: when usage is normal, all jobs run. When it's elevated (>70% of quota), only high-priority jobs execute. When critical (>85%), only critical jobs. When approaching shutdown (>95%), everything pauses. The user sets a budget; Instar enforces it automatically using Claude Code's own metrics. No runaway costs, no surprise bills. The agent manages its own economics.

**What this would cost to build yourself:** Token counting, usage aggregation, cost calculation per model, budget enforcement logic. Claude Code handles the counting; Instar handles the governance.

### 10. Model Flexibility (Per-Task Optimization)

**What it does:** Claude Code supports multiple models (Opus, Sonnet, Haiku) and can switch between them.

**Why it matters for Instar agents:**
- Model upgrades (when Anthropic ships new versions) are available immediately without code changes

**How Instar amplifies this:** Raw model switching becomes **per-job intelligence routing**. Each job definition specifies the appropriate model tier: Opus for complex reasoning tasks (research synthesis, architectural decisions), Sonnet for general work (code changes, standard operations), Haiku for quick tasks (health checks, status updates). This isn't manual selection by the user — it's configured once per job type and executed automatically every time the job runs. Cost optimization happens structurally: expensive models only where they add value, cheap models for routine work. Combined with quota-aware scheduling, model selection can even adapt under cost pressure — downgrading from Opus to Sonnet when approaching budget limits.

**What this would cost to build yourself:** Multi-model routing, model selection logic, API configuration per model, adaptive model downgrading. With Claude Code, it's a single parameter. With Instar, it's automatic per-job optimization.

### 11. CLAUDE.md Auto-Discovery (Project-Aware Agents)

**What it does:** Claude Code automatically discovers and loads `CLAUDE.md` files from the project root and subdirectories. These files provide project-specific context, conventions, and instructions.

**Why it matters for Instar agents:**
- Nested CLAUDE.md files in subdirectories load automatically as the agent works in different areas
- Project conventions, safety rules, and behavioral guidelines are always in context
- The agent understands the project it's working in without being told every session

**How Instar amplifies this:** This is where Instar does its heaviest lifting. During `instar init`, Instar **generates** a comprehensive CLAUDE.md that includes:
- **Agent identity** — Who the agent is, its personality, its principles (from AGENT.md)
- **User context** — Who the user is, what they care about, how they communicate (from USER.md)
- **Behavioral guidelines** — Anti-patterns to avoid (never say "I can't", don't escalate to human, don't settle for empty results)
- **Infrastructure awareness** — What the Instar server provides, API endpoints, job scheduler, Telegram relay
- **Self-discovery instructions** — How to call `/capabilities` to verify what's available
- **Registry-first principle** — Check state files before broad exploration

Claude Code provides the *mechanism* (auto-discovery and loading). Instar provides the *content* — a rich behavioral foundation that turns a generic Claude Code session into a coherent autonomous agent. The CLAUDE.md is also maintained across updates: Instar adds new sections additively without overwriting user customizations.

**What this would cost to build yourself:** Custom context loading, file discovery, hierarchical override system, content generation, additive-only updates. Claude Code's CLAUDE.md system is a sophisticated context management layer that Instar leverages as a behavioral programming surface.

### 12. Session Resume & Continuity

**What it does:** Claude Code sessions are persisted locally with full conversation history. A session can be resumed with all prior context restored.

**Why it matters for Instar agents:**
- If a session is interrupted (crash, timeout, manual stop), it can be continued from where it left off
- Interactive Telegram sessions can be paused and resumed across hours or days
- The user's conversation thread is maintained even through interruptions

**How Instar amplifies this:** Claude Code provides session-level continuity. Instar adds **agent-level continuity** — coherence that spans across sessions, not just within them:
- **MEMORY.md** — Learnings persist across sessions. The agent remembers what it learned last week.
- **Relationship tracking** — The agent remembers who it's interacted with and the history of those interactions, across all sessions.
- **Telegram message history** — A persistent, human-readable conversation record (JSONL) that survives session boundaries, restarts, and even re-installations. The user's full history with their agent is preserved.
- **Job execution history** — Which jobs ran, when, what happened. The agent has a work history.
- **Session state tracking** — Instar tracks session lifecycle (spawned, running, completed, timed out) independently of Claude Code's internal state.

Claude Code remembers *within* a session. Instar remembers *across* sessions. Together, the agent has both short-term working memory and long-term persistent memory.

**What this would cost to build yourself:** Conversation persistence, state serialization, context restoration, cross-session memory, relationship tracking, execution history. Many agent frameworks start fresh every interaction; Instar agents accumulate knowledge over their lifetime.

---

## Advantages Instar Unlocks Through Configuration

These require minimal setup during `instar init` — the user doesn't maintain them, but they're not pure zero-config.

### 13. Hooks System (Behavioral Guardrails & Autonomous Safety)

**What Claude Code provides:** A hooks framework that fires scripts at lifecycle events (SessionStart, PreToolUse, PostToolUse, Notification, etc.). The PreToolUse hook is particularly powerful — it intercepts every tool call *before* execution and can block it, modify it, or inject context.

**What Instar installs automatically (4 PreToolUse hooks + 2 lifecycle hooks):**
- **dangerous-command-guard.sh** — Safety-level-aware command interception (see below)
- **grounding-before-messaging.sh** — Identity injection + convergence quality check before any outbound message
- **deferral-detector.js** — Catches the agent deferring work it could do itself; injects a due-diligence checklist
- **external-communication-guard.js** — Identity grounding reminder before any external API post
- **session-start.sh** — Injects agent identity, capabilities, server status, and job context every session start
- **compaction-recovery.sh** — Restores full identity content (not file references) after context compression

**How Instar amplifies this:** Claude Code provides the hook *mechanism*. Instar provides the hook *implementations* that solve the core challenges of autonomous agency:

1. **Identity persistence** — The #1 problem with long-running AI agents is identity drift. Hooks fire deterministically (shell scripts, not LLM reasoning) to re-inject identity at every critical boundary: session start, compaction, before messaging. The agent literally *cannot* forget who it is.

2. **Configurable safety progression** — The dangerous-command-guard reads `safety.level` from `.instar/config.json` and adapts its behavior (see "The Autonomous Safety Progression" below). This is implemented and shipping, not aspirational.

3. **Messaging coherence** — Before any outbound message (Telegram, email, etc.), the grounding hook fires. This ensures the agent speaks from identity, not from whatever context it was just working in. A convergence quality check can block messages that exhibit common agent failure modes (sycophancy, capability claims, experiential fabrication).

4. **Anti-deferral** — The deferral detector catches the agent saying "I can't do this" or "you'll need to handle this" and injects a checklist: *Did you check the docs? Do you already have credentials? Can you use browser automation?* This prevents the trained tendency to escalate to humans.

5. **Generated infrastructure** — Hooks are installed during `instar init` and re-installed on every update. They're not user-editable code that can drift or break — they're maintained infrastructure that evolves with Instar. When Instar ships an improved hook, every agent gets it on next update.

**The Autonomous Safety Progression (Implemented):**

This is one of the most important architectural patterns in Instar. The `dangerous-command-guard` hook implements a configurable safety level that creates a natural maturity progression:

**Level 1: Ask the user (`safety.level: 1`, default)** — Risky commands are blocked. The agent is told to ask the user for explicit confirmation via Telegram. This is the safe starting point. The user stays in the loop, the agent learns what's acceptable, and trust builds over time.

**Level 2: Agent self-verifies (`safety.level: 2`)** — Instead of blocking, the hook injects a **self-verification prompt** as Claude Code `additionalContext`. The agent must reason through a structured checklist before the command proceeds:

1. *Is this command necessary for the current task?*
2. *What are the consequences if this goes wrong?*
3. *Is there a safer alternative that achieves the same result?*
4. *Does this align with your principles and the user's intent?*

The hook also injects the agent's identity (first 20 lines of AGENT.md) into the verification context, grounding the self-check in who the agent is.

**Catastrophic commands are always blocked regardless of level** — `rm -rf /`, fork bombs, disk wipes cannot be self-verified. They require direct human execution. This is the hard floor that makes Level 2 safe.

**How it works technically:**
- Level 1: Hook exits with code 2 (block) + stderr message telling agent to ask user
- Level 2: Hook exits with code 0 (approve) + stdout JSON with `{"decision": "approve", "additionalContext": "...self-verification prompt..."}` — Claude Code injects this into the agent's context before the command executes

**Configuration:** Set `safety.level` in `.instar/config.json`:
```json
{
  "safety": {
    "level": 2
  }
}
```

**Why this is uniquely powerful:** Prompt-based guardrails can be ignored by the model. Permission-based guardrails require human attention. Hook-based self-verification is neither — it fires deterministically, injects a reasoning checkpoint, and the agent must process it before proceeding. This is the difference between "we told the agent to be safe" and "the agent structurally verifies its own actions before taking them."

**The path to full autonomy:** Level 1 → Level 2 is the natural progression from supervised to autonomous agent operation. It's a single configuration change, not a code change. The same hook infrastructure supports both modes — the user decides when their agent is ready to self-supervise.

### 14. MCP Server Ecosystem

**What Claude Code provides:** A protocol for connecting external tool servers. Any MCP server works with any Claude Code session.

**What Instar configures automatically:**
- Playwright MCP (browser automation) is installed during setup
- Users can add any additional MCP servers and every agent session inherits them

**How Instar amplifies this:** The MCP ecosystem is growing rapidly — database connectors, API integrations, communication tools, specialized services. With raw Claude Code, users must discover, configure, and maintain MCP connections. With Instar, the user adds a server config once and every agent session inherits it automatically. New capabilities become available to the agent without restarting or reconfiguring anything. Instar also auto-configures Playwright (browser automation) during setup, giving every agent web interaction capabilities out of the box. When someone builds a new MCP server for Slack, Jira, GitHub, or any service, Instar agents can use it by adding one config line — the entire ecosystem becomes the agent's toolbox.

### 15. Skills (Self-Authored Behavioral Toolkit)

**What Claude Code provides:** A skill system where `.claude/skills/` directories are auto-discovered and available via slash commands. Skills are markdown files — no code required.

**What Instar scaffolds:**
- `.claude/skills/` directory created during init — the agent has a place to put skills from day one
- CLAUDE.md tells the agent it can and should create skills when it recognizes repeated patterns
- Skills are listed as the #1 item in "How to Build New Capabilities" — above jobs, scripts, and integrations
- The agent creates skills autonomously. The user doesn't write them, configure them, or even know they exist.

**How Instar amplifies this:** The user never touches skills. They say "check production health" — and if the agent has done this before, it already created a `/health-check` skill that captures the full workflow. If it hasn't, it does the work, recognizes the pattern, and creates the skill for next time. The user just gets faster, more consistent results over time without knowing why.

Under the hood, skills become **schedulable, autonomous capabilities**. In raw Claude Code, skills are invoked by users typing slash commands. In Instar, the job scheduler can invoke skills on a cron schedule — a skill that checks production health runs every 4 hours, a skill that processes feedback runs daily, a skill that generates reports runs weekly. Skills also compose with Instar's messaging layer — a skill can send results to Telegram, email, or any connected channel.

The compounding effect is the real story: each skill the agent creates makes future sessions more capable. A month-old Instar agent has dozens of self-authored skills covering its user's specific workflows. A new API-based agent starts from zero every time. **The agent is building its own behavioral repertoire** — not because someone programmed it, but because the infrastructure teaches it that this is how it grows.

---

## The Compound Effect

Each advantage above is valuable individually. Together, they compound — and the amplification layers multiply the compound effect further:

| Scenario | Claude Code provides | Instar amplifies |
|----------|---------------------|-----------------|
| Agent runs a 3-hour autonomous job | **Auto-compaction** prevents crash. **Prompt caching** reduces cost. **Checkpoints** protect files. | **Identity hooks** survive every compaction. **Quota governance** prevents cost overruns. **Dangerous-command guard** prevents damage. **Telegram history** maintains coherence record. **Job tracking** logs execution. |
| Agent needs to research and act | **WebSearch** finds info. **WebFetch** reads pages. **Subagents** parallelize. | **CLAUDE.md** provides domain context for targeted searching. **MEMORY.md** remembers what was learned before. **Skills** wrap research workflows. Results relay to Telegram automatically. |
| Agent encounters a complex coding task | **Extended thinking** reasons deeply. **File tools** navigate codebase. **Bash** runs tests. **Edit** makes precise changes. | **Per-job model selection** routes to Opus. **MEMORY.md** remembers project layout. **Three-layer safety** (always-block + self-verify + checkpoint rollback). Agent reports completion to Telegram. |
| Agent about to run a risky command | **Checkpoints** snapshot files before edits. | **Safety Level 1**: Hook blocks, agent asks user. **Safety Level 2**: Hook injects self-verification prompt, agent reasons about consequences before proceeding. Catastrophic commands always blocked. Same hook, configuration change. |
| Agent hits a context limit | **Auto-compaction** summarizes history. | **compaction-recovery.sh** re-injects full identity content. **active-job.json** restores job context. **Telegram JSONL** provides external coherence record. Agent continues *as itself*. |
| User goes to sleep | Claude Code session continues running. | **Job scheduler** queues and executes autonomous work. **Stall detection** alerts if something hangs. **Telegram topics** collect results for morning review. Agent is productive while you sleep. |
| Anthropic ships a new feature | Available in next Claude Code session. | Available to every Instar agent immediately. **Zero integration work.** Hooks, skills, and CLAUDE.md continue to amplify the new feature automatically. |

---

## The Competitive Narrative

### What other agent frameworks have to build and maintain:

- Tool integration layer (file ops, search, web access, shell execution)
- Context management (truncation, summarization, compaction)
- Cost optimization (caching, model routing)
- Safety guardrails (permission systems, rollback)
- Session persistence (conversation history, resume)
- Multi-agent coordination (subagent spawning, result aggregation)
- Identity persistence across context boundaries
- Human-in-the-loop messaging
- Job scheduling and execution
- Cross-session memory

### What Instar's architecture provides:

**Layer 1: Claude Code (inherited free, maintained by Anthropic)**
All tool integration, context management, cost optimization, safety, session persistence, and multi-agent coordination. Improving every time Anthropic ships an update.

**Layer 2: Instar (the amplification layer)**
- **Persistence** — Sessions that survive restarts, compaction, and interruptions with identity intact
- **Scheduling** — Cron-based autonomous job execution with quota governance
- **Identity** — Agents that know who they are across context boundaries, enforced by deterministic hooks
- **Messaging** — Telegram integration that turns command-line sessions into conversations
- **Memory** — Cross-session learnings, relationship tracking, execution history
- **Behavioral infrastructure** — Hooks that enforce consistency without relying on prompt engineering
- **Cost governance** — Quota-aware scheduling that prevents runaway spending automatically

**The multiplication effect:** Other frameworks build Layer 1 from scratch and maintain it forever. Instar delegates Layer 1 to Claude Code and focuses entirely on Layer 2 — the hard problems of autonomous agency that Claude Code doesn't solve. Every Anthropic improvement to Layer 1 makes Layer 2 more powerful. The gap between Instar and competitors widens with every Claude Code release.

---

## The Anthropic Alignment Angle

Every Instar deployment is a Claude Code power user:
- **Each agent session** demonstrates Claude Code's tool use, context management, and reasoning in production
- **Each job execution** showcases autonomous Claude Code operation at scale
- **Each compaction survival** proves Claude Code's session resilience
- **Each MCP server integration** validates the MCP ecosystem

Instar doesn't compete with Claude Code. **Instar is the best advertisement for Claude Code** — showing what's possible when you wrap it in the right infrastructure for autonomous operation.

The pitch to Anthropic: support Instar, and every Instar deployment becomes a Claude Code deployment. Every Instar user becomes a Claude Code power user. Every Instar agent running in production demonstrates Claude Code capabilities that most users never discover.

---

## Summary: The 15 Inherited + Amplified Advantages

| # | Claude Code Provides | Instar Amplifies With | User Interaction |
|---|---------------------|----------------------|-----------------|
| 1 | Prompt Caching | Cache-friendly architecture (stable CLAUDE.md, consistent job prompts) | None |
| 2 | Auto-Compaction | Identity recovery hooks, MEMORY.md, Telegram history, job context re-injection | None |
| 3 | Extended Thinking | Per-job model routing, rich identity context for deeper reasoning | None |
| 4 | Checkpoint/Rollback | Three-layer defense: always-block catastrophic + safety-level-aware self-verify + checkpoint rollback | None |
| 5 | Web Search & Fetch | Domain-aware research patterns, skill-wrapped workflows, result relay | None |
| 6 | File System Intelligence | Project maps in CLAUDE.md, accumulated knowledge in MEMORY.md | None |
| 7 | Bash Execution | Self-authored script accumulation, MEMORY.md toolbox awareness, compounding automation | None |
| 8 | Subagent Spawning | Context propagation via CLAUDE.md, custom agent definitions | None |
| 9 | Token Tracking | Quota-aware scheduling, budget governance, automatic throttling | None |
| 10 | Model Flexibility | Per-job model selection, adaptive downgrading under cost pressure | None |
| 11 | CLAUDE.md Auto-Discovery | Generated behavioral programming: identity, guidelines, anti-patterns, self-discovery | None |
| 12 | Session Resume | Cross-session memory, relationship tracking, Telegram history, job history | None |
| 13 | Hooks Framework | 6 pre-installed hooks + safety level progression (Level 1: ask user → Level 2: self-verify) | None |
| 14 | MCP Protocol | Auto-configured Playwright, inherited servers across all sessions | Minimal |
| 15 | Skills System | Agent self-authors skills from patterns, scheduled execution, compounding behavioral repertoire | Minimal |

---

## The Promise

Fifteen inherited capabilities. Six behavioral hooks. A job scheduler, identity persistence, cost governance, messaging integration, and a self-authoring skill system. All of it invisible.

What the user gets is simpler than any of this: **a competent AI partner that knows them, grows with them, works while they sleep, and gets better every day.** They never configure it. They never manage it. They just talk to it — and it handles the rest.

That's what Instar builds on top of Claude Code. Not a dashboard. Not a platform. A relationship with an agent that works.
