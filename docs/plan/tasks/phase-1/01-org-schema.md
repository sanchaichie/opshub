---
id: P1-01
title: "Organizations, memberships + RLS foundation"
phase: 1
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P1-01 — Organizations, memberships + RLS foundation

## Goal
The multi-tenant base that every other table builds on: organizations, memberships with roles, the RLS helper functions, and a personal org created automatically for each new user.

## Acceptance criteria
- [x] Migration: `member_role` enum, `organizations`, `memberships`, `private.is_org_member()`, `private.has_org_role()`
- [x] Trigger on `auth.users` creates a personal org + owner membership on sign-up
- [x] RLS: members read their orgs; owner/admin update; owners manage memberships; users always see their own memberships
- [x] pgTAP: user A can't see org B; non-owners can't change memberships; sign-up creates exactly one org
- [x] migration-reviewer: APPROVE

## Files touched
- `supabase/migrations/*_organizations.sql`
- `supabase/tests/organizations.test.sql`
- `shared/types/database.types.ts`

## How Claude was used
- **Skills:** ran `new-migration` (template, local reset, pgTAP, review) and `db-reset` for every iteration. The PostToolUse hook reminded Claude to reset and review after each migration edit.
- **pgTAP caught a real security gap.** The first version used `alter default privileges in schema private revoke execute ... from public` to lock down helper functions. The test "anon cannot call the RLS helpers" failed. Claude inspected `pg_default_acl` and `pg_proc.proacl` and found the cause: a schema-level default privilege *can't* remove PUBLIC's global EXECUTE grant, so every function was still callable by anyone. The fix is an explicit revoke on each function. The lesson went into the `new-migration` skill and the reviewer's checklist, and became a permanent project-wide test (`privileges.test.sql`, added in P1-02).
- **migration-reviewer, round 1: CHANGES REQUIRED.** Required: use the project's full `revoke all ... from public, anon, authenticated` pattern on every function. Nits, all applied:
  - revoke all table privileges, then grant select (`references`/`trigger` were still granted)
  - a nicer fallback org name ("Personal workspace")
  - a longer slug suffix
  - a pointless `(select ...)` wrapper in one policy
  - record the policy-model change in the architecture changelog
  - three more privilege tests
- **pgTAP caught a slug collision.** The longer suffix sliced the user id. Fixtures with non-random ids then collided, because two users with one-letter emails both got the base slug `org`. Claude switched to a hash of the id, which gives uniform bits for any id.
- **migration-reviewer, round 2: APPROVE WITH NITS.** It caught one leftover `(select ...)` wrapper, now fixed.
- **Human decision (from planning):** the browser never writes. This task made the rule stricter than the original plan (no owner/admin write policies either); recorded in the architecture changelog.

## Outcome
Every user gets a personal organization at sign-up (the demo user is excluded via `app_metadata`, which users can't set themselves). Members can read only their own orgs and members. The browser can't create, change or delete either. Covered by 20 pgTAP tests.

## Follow-ups
- Server routes for renaming orgs and managing members (owner/admin, via `requireOrgRole`) → P1-03 / later
