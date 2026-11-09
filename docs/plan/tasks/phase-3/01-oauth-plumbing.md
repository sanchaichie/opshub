---
id: P3-01
title: "Generic OAuth connect/disconnect"
phase: 3
status: done
started: 2026-11-10
completed: 2026-11-10
commits: []
---

# P3-01 — Generic OAuth connect/disconnect

## Goal
One reusable OAuth flow that every connected integration (Slack now; HubSpot and Google later) plugs into, with tokens going straight to Vault.

## Acceptance criteria
- [x] `oauth` hooks on the `Integration` interface (authorize URL, code exchange, optional refresh)
- [x] `GET /api/oauth/[provider]/start` and `/callback`: owner/admin only, demo forbidden, signed single-use `state` with expiry (stored server-side), PKCE when the provider supports it, fixed redirect URI
- [x] Callback upserts `connections` (no secrets) and stores credentials via `set_connection_secret` (Vault)
- [x] `DELETE /api/connections/[provider]`: owner/admin, demo forbidden; deletes the Vault secret via cascade
- [x] `getCredentials(ctx, provider)` for actions; marks the connection `error` on auth failures
- [x] Unit tests: state signing, expiry, single use, tampering
- [x] security-reviewer

## Files touched
- `server/utils/oauth.ts`, `server/api/oauth/[provider]/*`, `server/api/connections/[provider].delete.ts`, `supabase/migrations/*_oauth_states.sql`

## How Claude was used
- **Design: random, stored state instead of a signed one.** `state` is 32 random bytes; only its SHA-256 is stored (`private.oauth_states`). Each one expires in 10 minutes and is deleted when used.
  - The raw value also goes into an httpOnly cookie scoped to `/api/oauth`, and the callback must present both, which defeats login-CSRF.
  - Because state is random and stored server-side rather than signed, the planned `NUXT_OAUTH_STATE_SECRET` turned out to be unnecessary and was dropped.
- **PKCE (S256)** is implemented and unit-tested against RFC 7636's appendix B vector. Claude first misremembered the vector's verifier; the failing test caught it, and Claude computed both candidates rather than guessing.
- **Live checks:**
  - signed out → 401; member → 403; demo visitor → 403
  - owner → redirected to Slack with the httpOnly state cookie
  - callback without that cookie → `state_mismatch`; declined → `declined`; reused state → `expired`
  - disconnect deletes the connection and its Vault secret (0 orphaned secrets)
- **migration-reviewer: APPROVE WITH NITS.** All applied:
  - the expired-state sweep is capped at 500 rows
  - the provider is checked in SQL, not only in TypeScript
  - tests that live states survive the sweep and that deleting an org removes its pending flows
- **security-reviewer: PASS WITH NITS.** Database errors in the callback and disconnect routes are now wrapped, so internals never reach a response. The other nits are in P3-02 and P3-03.

## Outcome
Any connected integration plugs into one OAuth flow: start, callback, disconnect, with credentials stored only in Vault. HubSpot and Google (Phases 4–5) only need to supply their `OAuthConfig`.

## Follow-ups
- Token refresh (`OAuthConfig.refresh`) gets its first real use with HubSpot → P4
