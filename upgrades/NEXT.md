# Upgrade Guide — vNEXT

<!-- bump: patch -->
<!-- Valid values: patch, minor, major -->
<!-- patch = bug fixes, refactors, test additions, doc updates -->
<!-- minor = new features, new APIs, new capabilities (backwards-compatible) -->
<!-- major = breaking changes to existing APIs or behavior -->

## What Changed

Instar now has a GPT-native runtime path alongside the existing Claude runtime. A new `codex-cli` session runtime was added for both autonomous sessions and interactive Telegram/topic sessions, including Codex session workers, resume-state persistence, and runtime-aware routing in the server layer. Cheap-first model mapping is now explicit for GPT-backed sessions: `haiku` maps to the least expensive likely-successful GPT tier, `sonnet` to the balanced tier, and `opus` to the more capable tier. Reflection and other lightweight intelligence paths can now resolve through Codex or Copilot providers instead of assuming Claude.

Runtime fallbacks were tightened so a non-Claude agent stops silently using Claude just because the binary happens to be installed on the machine. Shared intelligence, relationship intelligence, topic auto-summarization, and the lifeline doctor session now follow the selected runtime instead of keying off `claudePath` alone. For Codex-backed agents, that prevents background summarization or crash-doctor flows from consuming Claude quota unexpectedly.

The release also includes the previously added stability work for the Codex foundation branch: async session monitoring to reduce health-check stalls, cached running-session snapshots for scheduler hot paths, topic resume mapping for non-Claude runtimes, and targeted regression coverage around cheap-first routing, Codex session spawning, cost accounting helpers, and death-spiral prevention.

## What to Tell Your User

- **GPT-backed agent runtime**: "I can stay on the ChatGPT-backed path for my normal work instead of quietly falling back to Claude in the background."
- **Cheaper-by-default routing**: "I’ll start with the least expensive model that is likely to succeed and only step up when the task actually needs it."
- **Safer background behavior**: "My summaries and recovery workflows now follow the same backend I’m already using, so hidden helper tasks are less likely to burn the wrong quota pool."

## Summary of New Capabilities

| Capability | How to Use |
|-----------|-----------|
| GPT-backed Codex runtime | automatic when an agent is configured to use the Codex CLI runtime |
| Runtime-aware lightweight intelligence | automatic in server classification, summaries, and relationship resolution |
| Cheap-first model tier mapping | automatic via abstract haiku, sonnet, and opus routing |
| Copilot runtime scaffold for future Betty agent | branch foundation and handoff documentation |
