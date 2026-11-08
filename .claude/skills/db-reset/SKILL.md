---
name: db-reset
description: Safely reset the LOCAL Supabase database (re-apply all migrations + seed, run pgTAP, regenerate types). Use whenever the local schema or data needs a clean slate, or after writing a migration. Never for remote databases.
---

# Reset the local database

## The one rule
**Only the local stack is ever reset, and only through `pnpm db:reset`.**

- Never run `supabase db reset` directly, and never with `--linked` or `--db-url`. Hooks and permission rules block both.
- There is no supported way to reset the remote (production) database from this repo, and you must not invent one.
- **Demo data in production** is reset only by `select private.reset_demo_data();`. pg_cron runs it nightly at 03:00 UTC. That function deletes rows belonging to `is_demo` orgs and nothing else.

## Steps
1. Check that the stack is running and local:
   ```bash
   bash scripts/assert-local-db.sh
   ```
   If it isn't running, start it with `pnpm db:start`. If the check fails for any other reason, **stop and tell the user**. Don't work around it.
2. Reset:
   ```bash
   pnpm db:reset
   ```
   This asserts the target is local again, then re-applies migrations and `supabase/seed.sql`, runs pgTAP (`supabase/tests`) and regenerates `shared/types/database.types.ts`.
3. If a migration fails to apply, fix the **uncommitted** migration, or add a new one if the broken one is already committed. Then reset again.
4. Report: migrations applied, pgTAP result, and whether the generated types changed (`git status shared/types`).

## Local ports
opshub's local stack uses the 563xx ports (API 56321, DB 56322, Studio 56323, Mailpit 56324), so it doesn't collide with other local Supabase projects on 543xx and 553xx.
