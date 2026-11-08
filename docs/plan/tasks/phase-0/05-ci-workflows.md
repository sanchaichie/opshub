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
- [x] CI green on GitHub (first run, 2026-11-08)

## Files touched
- `.github/workflows/ci.yml`, `.github/workflows/db-migrate.yml`

## How Claude was used
- **No migrations from a laptop.** Claude designed the migration workflow so that nobody, Claude included, pushes migrations from a laptop.
  - Locally, `supabase db push` is an "ask" in both the permission rules and the Bash guard.
  - The workflow is the documented path.
- **Two separate secrets, two jobs.** Migration deploys and the keep-alive use different GitHub secrets, so each job holds only the credentials it needs.
- **The approval gate didn't exist at first.** The first push triggered `Deploy migrations`, and GitHub auto-created the `production` environment *without* a reviewer. Claude then tried to add one and got HTTP 422: GitHub's free plan doesn't support required reviewers on private repos. Claude flagged that the gate was silently missing and offered three fixes. The human chose to make the repo public, since clients need to read it anyway. Before the switch, Claude scanned all 73 committed files with the hook's own credential patterns (0 hits). It then set the owner as required reviewer and restricted deployments to `main`.

## Outcome
CI passes on GitHub: the app job, and the migrations + pgTAP job on a fresh database. Production migrations now need the owner's approval and can only deploy from `main`.

## Follow-ups
- Add the `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` secrets → P0-07
- Bump actions to Node 24 versions (GitHub deprecation warning on `checkout@v4`, `setup-node@v4`, `setup-cli@v1`) → P7
