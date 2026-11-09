---
id: P0-07
title: "Cloud setup: GitHub, Supabase, Vercel"
phase: 0
status: deferred
started: 2026-11-08
completed:
commits: []
---

# P0-07 — Cloud setup: GitHub, Supabase, Vercel

> **Deferred (2026-11-09):** the owner chose to build the app locally first and create the Supabase and Vercel accounts later. The GitHub parts are done.

## Goal
The repo is on GitHub (`sanchaichie/opshub`), linked to a Supabase cloud project and a Vercel project, with every secret in place, so CI, migration deploys and the keep-alive all run for real.

## Acceptance criteria
- [x] GitHub repo `sanchaichie/opshub` created (public); first push; CI green
- [x] GitHub environment `production` with the owner as required reviewer, `main` only
- [ ] GitHub secrets:
  - `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` (migrations)
  - `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (keep-alive)
- [ ] Supabase project created; the first migration applied through the `Deploy migrations` workflow (not from a laptop)
- [ ] Vercel project linked to the repo. Env vars set: `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_KEY`, `NUXT_SUPABASE_SECRET_KEY`, `CRON_SECRET`, `NUXT_PUBLIC_SITE_URL`
- [ ] `curl <prod>/api/health` returns `db: ok`; after the first cron run, a `vercel-cron` heartbeat exists
- [ ] Manual `keepalive.yml` dispatch records a `github-actions` heartbeat

## Files touched
- `supabase/.temp/project-ref` (local only, git-ignored)

## How Claude was used
_Fill in when done._

## Outcome
_Fill in when done._

## Follow-ups
-
