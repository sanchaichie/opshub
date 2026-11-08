---
name: pre-deploy
description: Run the OpsHub go/no-go checklist before merging to main or deploying - lint, typecheck, tests, pgTAP, security + migration review, remote schema drift, keep-alive health. Use before any merge to main or production deploy.
---

# Pre-deploy checklist

Run every step and collect the results. Don't stop at the first failure. Then print the table at the end.

1. **Static checks**: `pnpm lint`, `pnpm typecheck`.
2. **Unit tests**: `pnpm exec vitest run`.
3. **Database**: if `supabase/` changed since `origin/main`, run the db-reset skill (`pnpm db:reset`), which includes pgTAP.
4. **Generated types**: `git status shared/types` must be clean after step 3.
5. **Security review**: run the **security-reviewer** agent on `git diff origin/main...HEAD`.
6. **Migration review**: if there are new migrations, run the **migration-reviewer** agent on them.
7. **Remote drift (read-only)**: only if a project is linked (`supabase/.temp/project-ref` exists), run `supabase migration list --linked`. Report any remote-only migrations. **Never** run `db push`, `db reset` or `migration repair` here. Prod migrations go out through the `Deploy migrations` GitHub Action.
8. **Keep-alive**: if the user tells you the prod URL, `curl -s <prod>/api/health`. Warn if either heartbeat's `lastSeen` is older than 3 days, or one is missing.
9. **Tracking**: the current task file in `docs/plan/tasks/` has its acceptance criteria checked off.

## Output
```
| Check            | Result | Notes |
|------------------|--------|-------|
| Lint             | ✅/❌   |       |
...
Verdict: GO / NO-GO (list the blockers)
```
