---
id: P2-02
title: "EasyPost integration: labels + tracker webhooks"
phase: 2
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P2-02 — EasyPost integration: labels + tracker webhooks

## Goal
Paid orders automatically get a test-mode shipping label, and EasyPost's tracker webhooks move each order through its statuses.

## Acceptance criteria
- [x] `server/integrations/easypost/`: REST client on `http.ts` (test keys only), `create_shipment` (buy the cheapest rate, idempotent), HMAC webhook verification, Zod schemas, status mapper
- [x] Webhooks resolve their org from the order (new optional `resolveOrgId` in the Integration interface)
- [x] `order-flow`: `onOrderPaid` enqueues `easypost.create_shipment`; tracker updates call `transition_order`
- [x] Unit tests: signature, mapper (every EasyPost status), out-of-order updates don't move an order backwards
- [x] Local e2e with signed tracker webhooks: label_created → in_transit → delivered; replay is a no-op; another org's order with the same tracking code is untouched
- [x] security-reviewer
- [ ] Live run against EasyPost test mode (**pending keys**)

## Files touched
- `server/integrations/easypost/*`, `server/integrations/types.ts`, `server/flows/order-flow.ts`, `server/api/webhooks/[provider].post.ts`

## How Claude was used
- **Design: retry safety without an idempotency header.** EasyPost has no idempotency-key header, so the order row carries it:
  - The shipment id is saved as soon as it exists, and a retry re-uses it.
  - An "already purchased" error counts as success.
  - A unique index backs this up. A retry can never buy two labels.
- **Design: statuses never go backwards.** Carriers deliver tracker updates out of order, so the mapping is a pure, fully unit-tested function. A late "in transit" can't undo "delivered".
- **The local e2e caught a slow chain.** A payment's follow-up label job waited up to a minute for the next pg_cron sweep. The fast path now keeps running batches while they find work (within a 15s budget), so payment → label → tracking flows in seconds.
- **security-reviewer: FAIL, a cross-tenant bug in Claude's design.**
  - **The bug:** every order shares one of four EasyPost test tracking codes, and webhooks found their order *by tracking code*. One org's tracker updates could move **another org's** order, possibly a real customer's. Claude's e2e passed only because one order held each code at the time.
  - **The fix is structural.** Orders now match **only on globally unique ids** (a new `easypost_tracker_id`, or the shipment id), both enforced by unique indexes.
  - **A race the fix introduced, handled too:** a webhook can arrive before the tracker id is saved. It's now retried briefly instead of guessed, and when it resolves, the event is attached to the right org.
  - **Verified live:**
    - another org's order with the **same tracking code** is untouched
    - a webhook that beats the link resolves on retry
- **Lower-severity findings, all applied:**
  - **Injection risk:** a PostgREST `or()` filter was built from payload fields. Claude spotted the risk and replaced it with separate parameterized lookups; the reviewer flagged it independently.
  - **Unsafe label links:** label and tracking URLs are validated as https-only, and the UI only links https URLs.
  - **Replay protection:** its limits (no timestamp in EasyPost's signatures) are documented next to the code.

## Outcome
Paid orders automatically get a test-mode label, an EasyPost test tracker follows each parcel, and tracker webhooks move orders through `label_created → in_transit → out_for_delivery → delivered` (or `exception`).
- Replays and late updates are no-ops.
- Webhooks can only ever affect the order they belong to.
- All of it was verified locally with signed webhooks: 31 EasyPost unit tests plus the e2e above.

**Pending keys:** the live run against EasyPost test mode (buying a label, real tracker playback) needs `NUXT_EASYPOST_API_KEY` and `NUXT_EASYPOST_WEBHOOK_SECRET`.

## Follow-ups
- Live EasyPost run → when keys exist (P0-07)
