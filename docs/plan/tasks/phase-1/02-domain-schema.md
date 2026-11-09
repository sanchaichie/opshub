---
id: P1-02
title: "Orders, customers + event log schema"
phase: 1
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P1-02 — Orders, customers + event log schema

## Goal
Every remaining Phase 1 table: customers, orders and their status history, the events log/queue with per-attempt history, connections and their Vault-backed secrets, AI outputs and usage counters.

## Acceptance criteria
- [x] Enums: `order_status`, `event_direction`, `event_status`, `connection_status`
- [x] Tables per 00-architecture.md §2, with FK indexes and the worker index (partial on `next_attempt_at`, filtered by status; see the migration comment)
- [x] Idempotency: unique `(provider, external_id)` for inbound, `(provider, idempotency_key)` for outbound; orders unique on `stripe_payment_intent_id`
- [x] RLS: members can **read** org rows; no write policies for `authenticated`; `connection_secrets` and `usage_counters` are service-only
- [x] Functions: `claim_events`, `bump_usage`, `set/get_connection_secret` (Vault), service-role only
- [x] Realtime publication on `events` and `orders`
- [x] pgTAP: cross-org isolation on every table; browser roles can't call service functions; duplicate inbound event rejected
- [x] migration-reviewer: APPROVE

## Files touched
- `supabase/migrations/*_orders_events.sql`
- `supabase/tests/domain.test.sql`

## How Claude was used
- **Skills:** `new-migration` and `db-reset`.
- **Design choices Claude made and recorded** (architecture changelog):
  - internal tables in the `private` schema
  - service functions in `public` but executable only by `service_role`
  - `transition_order()` so an order and its timeline can't disagree
  - a trigger that deletes the Vault secret when a connection is deleted
- **pgTAP:** 26 tests in `domain.test.sql`:
  - cross-org isolation on all 7 tables
  - browser writes denied
  - idempotency constraints
  - the claim queue's selection rules
  - rate limiting
  - Vault round-trip and rotation, and cleanup on delete
  - Realtime publication
  - A collation quirk in the Realtime check was fixed by querying the catalog directly.
- **migration-reviewer: APPROVE WITH NITS. Its findings:**
  - **Should-fix (a real bug):** if the worker crashed during an event's *last* allowed attempt, the event stayed `processing` forever. Nothing could claim it or move it to `dead`, so the inspector would show it running indefinitely. `claim_events` now dead-letters those rows first, with a pgTAP case.
  - `transition_order` could link an order's history to *another org's* event. It now rejects that (pgTAP case added).
  - The architecture doc still listed the old function names. Updated.
  - The worker index is partial rather than the planned composite. Documented why in the migration.
  - It suggested turning the manual "PUBLIC can execute?" check into a test. Now `privileges.test.sql` checks every project function on every CI run.
  - Deferred, see follow-ups: purging `usage_counters`, and EasyPost lookup indexes.
- **The reviewer stayed inside its permissions.** Claude's updated checklist asked the reviewer to run a `docker exec psql` query that wasn't on its allowed-command list. The reviewer didn't run it and said why. Claude replaced that step with the pgTAP test rather than widening the agent's permissions.

## Outcome
All Phase 1 tables exist with RLS: the browser can read its own org's rows, and only the server can write. The event log doubles as a queue with idempotency guaranteed by constraints, crash recovery, and dead-lettering. Connection credentials are encrypted in Vault and removed when a connection is deleted. Covered by 26 domain tests plus 2 project-wide privilege tests.

## Follow-ups
- pg_cron job to purge old `usage_counters` windows → P1-04 (cron migration)
- Indexes on `orders.easypost_shipment_id` and `orders.tracking_code` for webhook lookups → P2
