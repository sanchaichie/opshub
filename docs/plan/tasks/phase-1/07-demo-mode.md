---
id: P1-07
title: "Demo mode: Try demo, limits, nightly reset"
phase: 1
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P1-07 — Demo mode: Try demo, limits, nightly reset

## Goal
Anyone can click **Try demo** and run the flow safely: a seeded demo org, a throwaway account per visitor (ADR 0007), demo restrictions, rate limits, and a nightly reset that provably can't touch real orgs.

## Acceptance criteria
- [x] Demo org created by migration; sample orders, events and history seeded by `private.seed_demo_data()` (no demo user or password at all; see ADR 0007)
- [x] `POST /api/demo/login`: creates this visitor's own throwaway account in the demo org and signs in server-side; no credential ever reaches the browser
- [x] Demo restrictions: `forbidInDemo()` is ready, demo Checkout masks the visitor's email, and no connection/member/org-changing routes exist yet (they must call `forbidInDemo` when added)
- [x] Limits: Simulate 5/IP/hour + 100/day for the demo (per-org budget for real orgs); demo login 10/IP/hour + 1,000/day
- [x] `private.reset_demo_data()` + pg_cron nightly at 03:00 UTC, also purging visitor accounts older than a day
- [x] pgTAP: reset leaves non-demo orgs untouched (a row in every table); browser roles can't execute it
- [x] Landing page with **Try demo**; in-app banner while in the demo

## Files touched
- `supabase/migrations/20261109035534_demo_mode.sql`, `supabase/tests/demo.test.sql`, composite FKs in `20261109004624_orders_events.sql`
- `server/api/demo/login.post.ts`, `app/pages/index.vue`

## How Claude was used
This task is the clearest example in the project of review agents changing the design.

- **migration-reviewer: CHANGES REQUIRED, 2 blockers in the reset Claude had written.**
  1. **Cross-tenant cascades.** The deletes were scoped to the demo org, but the foreign keys were single-column, so a real org's row that pointed at a demo row would be **deleted** (cascade) or **unlinked** (set null) by the nightly job. Claude fixed it at the schema level: every org-scoped reference is now a composite `(org_id, x_id) → (org_id, id)` key, so cross-org links can't exist at all. That also hardens tenant isolation everywhere. 4 pgTAP tests prove the database rejects cross-org links.
  2. **`is_demo` could change.** A real org flipped to demo by any bug would be wiped at 03:00. `is_demo` is now immutable via a trigger, and the reset locks the demo orgs it works on.
  - **Should-fix, also applied:** the reset could delete jobs a worker was processing, so it now skips those.
  - **Tests rewritten.** A real org now gets a row in every table, and the tests prove every row and every link survives.
  - **Re-review: APPROVE WITH NITS.** Applied: comments, a test pinning the 5-minute in-flight cutoff, and a note on what the lock achieves.
- **security-reviewer: FAIL, a design flaw in the plan itself.** The plan had *one shared demo account*. Supabase's sign-out revokes **all** of a user's sessions, so any visitor clicking "Sign out" would log out every other visitor, and a hostile visitor could do it on purpose. Visitors could also change the shared password.
  - Claude replaced the shared account with **a throwaway account per visitor** in the same shared demo org ([ADR 0007](../../../decisions/0007-per-visitor-demo-accounts.md)). Visitors see the same thing, but nothing they do with their account reaches anyone else, and no demo password exists anywhere.
  - **Verified live:** two visitors get separate accounts and see the same demo orders. Visitor A's **global sign-out** via the raw Auth API left visitor B's session working.
  - **Other findings applied:**
    - an Origin check on the login route (cross-site requests get 403)
    - sign-out limited to this device only
    - the shared simulate budget now applies only to the demo org
- **Bug Claude found while testing:** GoTrue's admin `createUser` writes `app_metadata` *after* inserting the user, so the sign-up trigger couldn't recognize demo users and gave each one a personal workspace. The route now removes it, the nightly purge sweeps any leftovers, and the SQL comments say so accurately.
- **An earlier version's safety check, still worth recording:** with the shared account, Claude added a guard so that a misconfigured demo email pointing at a real person's account was refused rather than having its password reset. It was verified live, then made moot by ADR 0007 (no configured demo account exists anymore).

## Outcome
**Try demo** puts any visitor into a seeded demo store (5 orders in different states, with history and events) under their own throwaway account. They can simulate orders, run a masked test Checkout, inspect and retry events, and see others' activity live, but can't affect anyone else's session or reach real data. Every night at 03:00 UTC the demo is reset and old visitor accounts are purged, by a function that provably can't touch a real org.

## Follow-ups
- Routes that change connections, members or org settings must call `forbidInDemo()` → P3 (Connections) and later
- Configure the production worker URL/secret; the nightly reset runs as soon as pg_cron exists in prod → P0-07
