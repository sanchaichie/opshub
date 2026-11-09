---
id: P2-03
title: "Stuck-order detection"
phase: 2
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P2-03 — Stuck-order detection

## Goal
Orders that stop moving get flagged as stuck automatically, so problems surface without anyone watching.

## Acceptance criteria
- [x] `private.mark_stuck_orders()` + pg_cron every 5 minutes (only orders with a real shipment): `label_created` for 48h+ or `in_transit`/`out_for_delivery` for 5 days+ → `stuck`, with history and an internal `order.stuck` event
- [x] A later tracker update un-sticks the order
- [x] pgTAP: thresholds, only eligible statuses, other orgs untouched, idempotent
- [x] migration-reviewer

## Files touched
- `supabase/migrations/*_stuck_orders.sql`, `supabase/tests/stuck.test.sql`

## How Claude was used
- **Design: detection in SQL, reaction in TypeScript.** pg_cron marks stalled orders and enqueues an internal `order.stuck` event. A small built-in `opshub` integration handles it through the same `onOrderStatusChanged` flow as a tracking update, so Phase 3's Slack alerts cover stuck orders with no extra code.
- **The demo** uses 15/30-minute thresholds instead of 48h/5d, so visitors can watch an order get stuck.
- **pgTAP caught a design flaw:** the demo's seeded baseline orders would have been marked stuck five minutes after every reset. New rule: only orders with a real EasyPost shipment can be stuck, since otherwise there's nothing to wait for.
- **migration-reviewer: APPROVE WITH NITS.** All applied:
  - Should-fix: a late `pre_transit` replay could move a stuck order *back* to `label_created`. Fixed, with a unit test.
  - The idempotency key now uses microsecond precision.
  - If an order gets stuck, moves, and gets stuck again before the worker runs, only the latest stall's event acts, so alerts aren't duplicated.
- **Live check:** a 6-day-stalled order was marked stuck, and the worker processed its `order.stuck` event successfully.

## Outcome
Orders that stop moving are flagged `stuck` every 5 minutes, with a timeline entry and an event that later phases react to (Slack in Phase 3). A tracker update un-sticks them. Covered by 11 pgTAP tests.

## Follow-ups
- Slack alert for stuck orders → P3 (via `onOrderStatusChanged`)
