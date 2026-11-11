---
id: P5-01
title: "Google OAuth (Gmail + Calendar)"
phase: 5
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P5-01 — Google OAuth (Gmail + Calendar)

## Goal
Orgs connect a Google account with OAuth (a separate client from 'Sign in with Google'), granting only send-mail and calendar-event access.

## Acceptance criteria
- [x] `OAuthConfig` for Google: PKCE, `access_type=offline` + `prompt=consent` (to get a refresh token), scopes `gmail.send`, `calendar.events`, `openid email`
- [x] Account label = the connected Google address; refresh keeps the existing refresh token (Google doesn't resend it)
- [x] Unit tests with a stubbed Google API

## Files touched
- `server/integrations/google/oauth.ts`

## How Claude was used
- **The generic OAuth flow** from Phase 3, with PKCE turned on for the first time (Google supports it).
- **Least-privilege scopes:** `gmail.send` and `calendar.events`, plus `openid email` for the account label.
- **Two Google-specific details, both unit-tested:**
  - Google's consent screen lets people *untick* individual permissions. A connection missing Gmail or Calendar access is refused with a clear message, rather than failing later.
  - Google usually omits the refresh token when refreshing, so the stored one is kept. This answers the Phase 4 follow-up: Google's refresh tokens don't rotate, so the concurrent-refresh assumption holds.

## Outcome
Orgs can connect a Google account for Gmail sending and Calendar events, separately from signing in with Google.

## Follow-ups
-
