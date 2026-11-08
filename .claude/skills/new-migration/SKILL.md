---
name: new-migration
description: Create a new Supabase migration the OpsHub way (table + RLS + policies + grants + indexes + pgTAP), apply it locally, regenerate types, and get it reviewed. Use for ANY schema change: new table, column, function, policy, index or cron job.
---

# New migration

Schema changes are always a **new** timestamped file. A migration that is already committed is never edited: the file guard blocks it, because it may already have run in production.

## 1. Create the file
```bash
supabase migration new <snake_case_description>
```
Use one concern per migration, e.g. `create_orders`, `add_orders_tracking_index`.

## 2. Write it from this template
```sql
-- <What this migration does and why, in 1-3 lines.>

create table public.<things> (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  -- ...columns...
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index <things>_org_id_idx on public.<things> (org_id);

alter table public.<things> enable row level security;

-- Members read their org's rows. Writes go through server routes using the
-- service role after requireOrgRole(), so there are no write policies.
create policy "<things>: members can read"
  on public.<things> for select
  to authenticated
  using ((select private.is_org_member(org_id)));
```
Conventions:
- **Org-scoped tables:** an `org_id` FK, an index on it, and a select policy that wraps the helper in `(select ...)` so it's evaluated once per query.
- **Internal tables and secrets:** these go in the `private` schema. Enable RLS, add no policies, and say so in a comment.
- **Security definer functions:**
  - `set search_path = ''` and schema-qualify everything.
  - `revoke all ... from public, anon, authenticated`, then grant only what's needed.
- **Realtime:** `alter publication supabase_realtime add table public.<things>;` only for tables the UI subscribes to.
- **Destructive statements** (`drop`, `truncate`, a data-losing `alter`) need a comment explaining why they're safe.

## 3. Add a pgTAP test
Create `supabase/tests/<things>.test.sql` covering:
- RLS isolation: a member of org A sees 0 rows of org B.
- Browser roles can't call service-only functions.
- Any safety rule the migration introduces.

You can delegate this to the **integration-test-writer** agent.

## 4. Apply locally
Use the db-reset skill (`pnpm db:reset`). It applies the migration, runs pgTAP and regenerates types. Fix the migration until all three pass.

## 5. Review
Ask the **migration-reviewer** agent to review the new file(s). Address every blocker before committing.

## 6. Commit
Commit the migration, its pgTAP test and the regenerated `shared/types/database.types.ts` **together**. CI fails if the types are stale. It reaches production only through the `Deploy migrations` GitHub Action, after manual approval.
