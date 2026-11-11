---
id: P4-03
title: "Contact + deal sync"
phase: 4
status: done
started: 2026-11-10
completed: 2026-11-11
commits: []
---

# P4-03 — Contact + deal sync

## Goal
Every paid order upserts a HubSpot contact and deal, and later status changes keep the deal current, without ever creating duplicates.

## Acceptance criteria
- [x] `sync_deal` action: upsert contact by email, upsert deal by `opshub_order_id` (stage: closed won when paid, closed lost when cancelled; `opshub_status` mirrors the order), associate deal ↔ contact; store ids on customer and order
- [x] `order-flow` enqueues it on paid and on every later status change when HubSpot is connected
- [x] 429s back off (HubSpot often sends no Retry-After: default to its 10-second window)
- [x] Unit tests: payload mapping, name splitting, stage mapping, 429 fallback, retry is an update not a duplicate
- [ ] Live run against a HubSpot developer test portal (**pending keys**)

## Files touched
- `server/integrations/hubspot/*`, `server/flows/order-flow.ts`

## How Claude was used
- **Design: retry-safe without an idempotency header.** Every call is an upsert on a unique key (contacts by email, deals by `opshub_order_id`), and the v4 default association is idempotent. A retried or repeated sync is an update, never a duplicate.
- **Design: stages describe the sale.** The deal stage records the *sale* (won when paid, lost when cancelled). Fulfilment progress goes in `opshub_status`, so it doesn't clutter a client's sales pipeline.
- **Rate limits:** HubSpot's 429s often lack `Retry-After`, so those wait out HubSpot's 10-second window.
- **The order flow** enqueues a sync on payment and on every later status change, with one idempotency key per state.
- **security-reviewer:** PASS WITH NITS. No token leaks, no cross-org path, minimal personal data sent to HubSpot (email, name, amount, status), and no route by which a demo visitor reaches HubSpot.

## Outcome
Each order keeps a HubSpot contact and deal up to date throughout its life.

**Pending keys:** a live run against a HubSpot developer test portal.

## Follow-ups
- Live run against a HubSpot test portal → P0-07
