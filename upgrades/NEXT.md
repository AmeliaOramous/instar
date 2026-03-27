# Upgrade Guide — v0.24.7

<!-- bump: patch -->

## What Changed

- **Tunnel reconnect storm fix**: Added a start mutex to TunnelManager so concurrent `start()` calls coalesce instead of racing. Sleep/wake handler now disables auto-reconnect before force-stopping the tunnel, preventing exit handlers from spawning competing reconnection chains. Previously, sleep/wake cycles could trigger dozens of concurrent tunnel reconnection attempts.

- **Non-fatal crash prevention**: The uncaught exception handler no longer crashes the server for "Cannot set headers after they are sent to the client" and similar HTTP lifecycle errors. These are expected during tunnel transitions and don't affect server stability. Previously, a single double-response event would kill the entire server process.

- **Lifeline startup grace period fix**: During the 3-minute startup grace period, the Lifeline now probes health optimistically. Previously, health checks were completely skipped during boot, causing incoming Telegram messages to be queued with "Server is temporarily down" even when the server was fully responsive (typically within ~10 seconds of restart).

- **Queue delivery confirmation**: When queued messages are replayed after server recovery, the Lifeline now sends a per-topic confirmation ("Server recovered — your queued message has been delivered") so users know their message actually reached the session.

## What to Tell Your User

Server stability improvements. The server is much less likely to restart unexpectedly, and when it does restart, your messages should flow through almost immediately instead of being queued for up to 3 minutes. You'll also get a confirmation when any queued messages are delivered.

## Summary of New Capabilities

- Tunnel reconnection is now atomic — no more reconnect storms after sleep/wake
- Non-fatal HTTP errors are logged as warnings instead of crashing the server
- Messages reach sessions within seconds of a restart instead of waiting 3 minutes
- Queued message delivery is confirmed via Telegram
