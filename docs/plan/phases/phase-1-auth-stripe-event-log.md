---
phase: 1
title: Auth, schema, Stripe, event log
status: done
started: 2026-11-09
completed: 2026-11-09
---

# Phase 1 — Auth, schema, Stripe, event log

## Goal
One flow working end to end in production: a Stripe test payment (real Checkout or **Simulate order**) arrives as a signed webhook, is stored idempotently, becomes an order, and shows up live in the dashboard and the webhook inspector, with retries.

## Scope
- Migrations: organizations, memberships, customers, orders, order_status_history, events, event_attempts, connections, connection_secrets, ai_outputs, usage_counters, plus RLS helpers and policies
- Auth: email/password + Google; org created on signup
- Core: events, worker, http wrapper, rate limits, `/api/jobs/run`, pg_cron `process-events`
- Stripe: Checkout, Simulate, webhook (verify, store, process)
- UI: dashboard + live feed, orders, event inspector with retry, Connections page
- Demo: seeded org/user, Try demo, rate limits, nightly `reset_demo_data()`

## Out of scope
- Shipping, CRM, chat, email, AI: later phases

## Tasks
- [x] [P1-01 Organizations, memberships + RLS foundation](../tasks/phase-1/01-org-schema.md)
- [x] [P1-02 Orders, customers + event log schema](../tasks/phase-1/02-domain-schema.md)
- [x] [P1-03 Auth: sign-up, login, Google, org context](../tasks/phase-1/03-auth.md)
- [x] [P1-04 Event core: log, queue, worker, retries](../tasks/phase-1/04-event-core.md)
- [x] [P1-05 Stripe: webhook, Checkout, Simulate order](../tasks/phase-1/05-stripe.md)
- [x] [P1-06 Dashboard UI: live feed, orders, event inspector](../tasks/phase-1/06-dashboard-ui.md)
- [x] [P1-07 Demo mode: Try demo, limits, nightly reset](../tasks/phase-1/07-demo-mode.md)

## Exit criteria
See [00-architecture.md → Verification (Phase 1)](../00-architecture.md#verification-phase-1-done).

## Retrospective
**Done locally on 2026-11-09. Live checks wait for accounts.** The parts that need cloud accounts are pending until P0-07: a real Stripe round-trip (test keys), the Vercel deploy, and production pg_cron. Everything else was verified against the local stack. Every webhook path was tested with Stripe-shaped payloads signed by a locally generated secret.

**Changed versus the plan**
- **Org-scoped foreign keys everywhere.** Not in the original schema. Added after migration-reviewer showed the nightly demo reset could otherwise reach into real orgs through cascades.
- **One throwaway account per demo visitor** instead of one shared demo account ([ADR 0007](../../decisions/0007-per-visitor-demo-accounts.md)). security-reviewer showed one visitor's sign-out would log out everyone.
- **No browser writes at all**, not even owner/admin org updates, so authorization lives in one layer.
- **No Stripe SDK.** Signature checks and the REST client are written out, so the whole webhook path is testable without an account.
- **A framework-free core** (`server/lib/`) under thin Nuxt/Supabase glue. That's what made the retry engine unit-testable.

**What the process caught**
- **Review agents** found two blockers and a privacy issue Claude hadn't considered:
  - cross-tenant cascades
  - a mutable `is_demo`
  - demo Checkout publishing a visitor's real email
  - plus a shared-account flaw that was in the plan itself
- **pgTAP tests** found:
  - a function-privilege gap (PUBLIC can execute new functions, and schema-level defaults can't revoke that)
  - a slug collision
  - Supabase's non-revocable grants on pg_net (recorded as an accepted risk)
- **Rendering every page signed in with real data** found two bugs lint and typecheck couldn't: the app layout never rendered, and list pages loaded empty on first load.
- **Claude's own test scripts were wrong three times.** Each time Claude traced the cause before blaming the app: fixed event ids, a lost env var, and a Realtime auth call in the script.

**Learned**
- **Read the schema the way a cascade does.** "Every delete is scoped to the demo org" was true and still unsafe.
- **Hidden defaults bite:** sign-out scope, function privileges and createUser's write order all behaved differently than assumed. Testing against the real stack is what surfaced them.
