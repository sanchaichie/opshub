---
id: P0-05
title: CI + gated migration deploys
phase: 0
status: done
started: 2026-11-08
completed: 2026-11-08
commits: []
---

# P0-05 — CI + gated migration deploys

## Goal
Every push is checked automatically. Schema changes reach production only through one audited, human-approved path.

## Acceptance criteria
- [x] `ci.yml`, app job: install (frozen lockfile), lint, typecheck, unit tests
- [x] `ci.yml`, database job: start a throwaway Postgres, apply all migrations + seed, run pgTAP, and fail if the committed generated types are stale
- [x] `db-migrate.yml` runs only on `main` when migrations change (or by hand). It waits for manual approval on the `production` environment, dry-runs, then pushes. It never resets.
- [ ] CI green on GitHub (needs the repo, P0-07)

## Files touched
- `.github/workflows/ci.yml`, `.github/workflows/db-migrate.yml`

## How Claude was used
- **No migrations from a laptop.** Claude designed the migration workflow so that nobody, Claude included, pushes migrations from a laptop.
  - Locally, `supabase db push` is an "ask" in both the permission rules and the Bash guard.
  - The workflow is the documented path.
- **Two separate secrets, two jobs.** Migration deploys and the keep-alive use different GitHub secrets, so each job holds only the credentials it needs.

## Outcome
The workflows are written, and they'll run once the GitHub repo exists.

## Follow-ups
- Create the `production` environment with required reviewers, plus the `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` secrets → P0-07
