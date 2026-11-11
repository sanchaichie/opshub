---
id: P4-01
title: "Expiring tokens: refresh in the shared plumbing"
phase: 4
status: done
started: 2026-11-10
completed: 2026-11-11
commits: []
---

# P4-01 — Expiring tokens: refresh in the shared plumbing

## Goal
Connected integrations with short-lived access tokens refresh them automatically, before they expire and after a 401, so actions never fail just because time passed.

## Acceptance criteria
- [x] `getFreshConnection(ctx, integration)`: refreshes when the token expires within 2 minutes, saves the new tokens to Vault, updates `token_expires_at`
- [x] A rejected refresh (revoked app) marks the connection `error` and fails permanently
- [x] `withAuthRetry`: on a 401, refresh once and retry the call
- [x] Unit tests: refresh window, 401 retry happens once, revoked refresh token

## Files touched
- `server/lib/connections.ts`

## How Claude was used
- **Refresh in the shared layer:** `getFreshConnection` refreshes 2 minutes before expiry, and `withAuthRetry` refreshes once and retries once on a 401. A refresh token the provider refuses marks the connection *Needs reconnecting*. A transient failure does not.
- **Unit tests:** run against a small in-memory fake of the database client (the refresh window, the 401 retry happening exactly once, revoked vs transient failures).
- **Verified live:** with a dummy HubSpot token, HubSpot answered 401, the refresh was refused (400), the connection was flagged "access was revoked; reconnect it", and the job dead-lettered instead of retrying forever.
- **security-reviewer (P4), applied:** a refresh racing a *reconnect to a different portal* could have overwritten the new tokens with the old portal's, sending the org's syncs to the wrong account. Saves are now conditional on the tokens being unchanged, and a test reproduces the race. Its other point, also applied: the comment no longer claims every provider tolerates concurrent refreshes; providers that rotate refresh tokens would need a lock.

## Outcome
Short-lived access tokens are refreshed automatically and safely. HubSpot is the first user; Google (Phase 5) reuses it.

## Follow-ups
- Google refresh tokens: check whether they rotate before reusing this unchanged → P5
