---
id: P0-06
title: Supabase keep-alive
phase: 0
status: done
started: 2026-11-08
completed: 2026-11-08
commits: []
---

# P0-06 — Supabase keep-alive

## Goal
The free-tier Supabase project never pauses from 7 days of inactivity, so the public demo is always up.

## Acceptance criteria
- [x] Migration: `private.system_heartbeats` (RLS on, no policies) plus `public.heartbeat(pinger)` and `public.heartbeat_status()`. Both functions are security definer with an empty search_path, and only `service_role` can execute them.
- [x] pgTAP (7 tests): browser roles can't call either function, the table isn't in `public`, beats accumulate, and unknown sources are rejected.
- [x] `GET /api/health`:
  - Without a token it's a read-only status.
  - With `Bearer CRON_SECRET` (constant-time compare) it also records a heartbeat.
  - DB errors return 503 without leaking details.
- [x] `vercel.json` cron: daily at 12:00 UTC → `/api/health`
- [x] `keepalive.yml`: calls the Supabase REST RPC directly every 2 days, independent of Vercel, and re-enables itself so GitHub's 60-day rule can't silently disable it
- [x] Verified locally:
  - Unauthenticated and wrong-token calls don't write.
  - Two cron calls give `beats: 2`.
- [ ] Verified in production (needs P0-07)

## Files touched
- `supabase/migrations/20261108133700_system_heartbeats.sql`, `supabase/tests/heartbeat.test.sql`
- `server/api/health.get.ts`, `server/utils/cron-auth.ts`
- `vercel.json`, `.github/workflows/keepalive.yml`, `nuxt.config.ts`

## How Claude was used
- The human asked for "a workaround so we never idle 7 days on Supabase". Claude added two **independent** pingers so that a Vercel or GitHub outage alone can't let the project pause. Both make a real database write, not just a GET.
- **Migration error caught locally.** The first migration failed on reset (`parameter name "source" used more than once`): the function's input and output columns shared a name. Claude caught it with `pnpm db:reset`, and since the migration was uncommitted, fixed it in place by renaming the input to `pinger`. Once a migration is committed, the file guard would force a new migration instead.
- The PostToolUse hook reminded Claude to reset and review right after the migration was written.

## Outcome
The keep-alive works end to end locally. Production verification is waiting on the cloud setup.

## Follow-ups
- Show the "DB heartbeat" line in the dashboard footer → P1 (UI)
- The `pre-deploy` skill warns when a heartbeat is more than 3 days old (already in the skill)
