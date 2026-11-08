# ADR 0006: Keep the free-tier Supabase project awake with two independent pingers

- **Status:** Accepted
- **Date:** 2026-11-08

## Context
Supabase pauses free-tier projects after 7 days without activity. A paused project would take the public demo offline. pg_cron jobs run *inside* the database and probably don't count as activity.

## Decision
Two independent external pingers each make a real write through `public.heartbeat(pinger)`:
1. Vercel Cron, daily → `/api/health` with `Bearer CRON_SECRET`.
2. A GitHub Actions schedule every 2 days, calling the Supabase REST RPC directly. It re-enables itself so GitHub's 60-day inactivity rule can't switch it off.

Heartbeats are stored in `private.system_heartbeats` and shown through `/api/health`.

## Consequences
- If either pinger stops (Vercel outage, a disabled workflow), the other still covers the 7-day window.
- This is a portfolio workaround, and Supabase can change its rules. The permanent fix is the Pro plan.
- If the project pauses anyway, migrations + seed in the repo mean it can be restored with only demo data lost, which is reset nightly anyway.
