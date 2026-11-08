---
id: P0-03
title: Local-only database safety
phase: 0
status: done
started: 2026-11-08
completed: 2026-11-08
commits: []
---

# P0-03 — Local-only database safety

## Goal
There is exactly one way to reset a database in this repo, `pnpm db:reset`, and it can only ever reach the local stack.

## Acceptance criteria
- [x] `scripts/assert-local-db.sh` passes only when all of these hold:
  - this project's local stack is running
  - its DB URL is on localhost
  - its port matches `supabase/config.toml`
  - no remote `DATABASE_URL`/`SUPABASE_DB_URL`/`PGHOST` is in the environment
- [x] `scripts/db-reset-local.sh` (`pnpm db:reset`) runs the assertion, resets with `--local`, runs pgTAP and regenerates types
- [x] There is no script for resetting a remote database
- [x] Local stack moved to its own ports (563xx), so it can't collide with other local projects
- [x] Verified: the assertion fails with a remote `DATABASE_URL` set, and passes against the local stack

## Files touched
- `scripts/assert-local-db.sh`, `scripts/db-reset-local.sh`
- `supabase/config.toml`, `package.json` (scripts)

## How Claude was used
- **A port collision showed why the port check matters.** The first `supabase start` failed because port 54322 was already taken by *another project's* local Supabase (`members-marketplace`). Claude didn't stop that project's containers. It gave opshub its own 563xx ports instead.
- **The port check exists because of that collision.** A plain "is it localhost?" check would have passed for the other project's database, and a reset could have wiped it. `assert-local-db.sh` therefore also requires the port to match this repo's `config.toml`.
- The `db-reset` skill and the Bash guard both point Claude to `pnpm db:reset`. A direct `supabase db reset` is denied with a message that names the safe command.

## Outcome
Resetting is safe by construction. The only reset path is local, port-checked and environment-checked, and it is enforced by permission rules, a hook, a skill and the script itself.

## Follow-ups
- `private.reset_demo_data()`, which only touches `is_demo` orgs, plus its pgTAP proof → P1
