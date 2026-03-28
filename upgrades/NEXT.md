# Upgrade Guide — vNEXT

<!-- bump: patch -->

## What Changed

### Message Queue & Status System (Phases 2 & 3)

**Phase 2: Session Tracking**
- Non-blocking message handling with immediate ACKs (< 1 second)
- Parallel message processing (up to 3 concurrent sessions)
- Background session spawning without blocking handlers
- State tracking for active and completed work

**Phase 3: Agentless Status Endpoint**
- Instant status queries that return in < 500ms
- Works even when Claude API is unavailable
- Service health monitoring (Claude, ChatGPT, local services)
- WhatsApp-formatted status responses

### GitHub Actions PR Review Workflow

- Automated code review workflow for pull requests
- Checks code quality, security, performance, testing, and documentation
- Posts feedback directly to PR comments
- Supports current Node.js action versions (v4)

## What to Tell Your User

"Your agent now handles messages non-blocking, ACKing immediately while processing work in the background. Use 'Status?' to check progress anytime—it works even if Claude is temporarily unavailable. Perfect for long-running tasks where responsiveness matters."

## Summary of New Capabilities

| Capability | Benefit |
|-----------|---------|
| Non-blocking message handling | Messages ACKed instantly, processed in parallel |
| Agentless status endpoint | Check progress without spawning new sessions |
| Service health monitoring | Know which services are available |
| Automated PR review workflow | CI/CD integration for code quality checks |

---

*See IMPLEMENTATION-SUMMARY.md and MESSAGE-QUEUE-SYSTEM.md for technical details.*
