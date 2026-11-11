---
id: P7-05
title: "Launch checklist (for the owner)"
phase: 7
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P7-05 — Launch checklist (for the owner)

## Goal
One page listing every account, key, setting and SQL snippet needed to take OpsHub from local to live, in order, plus the live checks each integration is still waiting for.

## Acceptance criteria
- [x] `docs/launch-checklist.md`: accounts in order, env vars per platform (Vercel, GitHub secrets, Supabase), demo connections, then the pending live checks from every phase
- [x] P0-07 updated to point to it

## Files touched
- `docs/launch-checklist.md`, `docs/plan/tasks/phase-0/07-cloud-setup.md`

## How Claude was used
- **One page that gathers what's spread across seven phases' task files:**
  - accounts in dependency order: Supabase before Vercel, because the migration deploy needs its secrets
  - exactly which value goes into which of the three places (Vercel env vars, GitHub secrets, the Supabase dashboard)
  - the SQL to point pg_cron at the deployed worker
  - per integration: the live check still pending from local-only testing
- **Written for the owner to follow without Claude.** It keeps the project rule that keys never pass through chat.

## Outcome
The path from local to live is one checklist. P0-07 points to it.

## Follow-ups
-
