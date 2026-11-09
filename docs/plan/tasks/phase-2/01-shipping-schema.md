---
id: P2-01
title: "Shipping addresses + lookup indexes"
phase: 2
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P2-01 — Shipping addresses + lookup indexes

## Goal
Orders carry a shipping address, so labels can be bought, and EasyPost webhooks can find their order quickly.

## Acceptance criteria
- [x] Migration: `orders.shipping_address` (jsonb, validated shape), `label_url`, indexes on `easypost_shipment_id` and `tracking_code` (P1-02 follow-up)
- [x] Simulate generates a plausible address; real Checkout collects one (`shipping_address_collection`); demo Checkout gets a generated one server-side, so it never collects a visitor's real address
- [x] Stripe handler stores the address; seeded demo orders have addresses
- [x] pgTAP + migration-reviewer

## Files touched
- `supabase/migrations/*_shipping.sql`, `server/integrations/stripe/*`

## How Claude was used
- **Privacy rule carried over from the Phase 1 review:** demo Checkout must not collect a visitor's real address either.
  - Real orgs collect it on Stripe's page.
  - Demo Checkout sends a generated address server-side (`payment_intent_data.shipping`).
  - Simulate generates one too, from a list of public buildings with valid ZIP codes.
- **migration-reviewer: APPROVE WITH NITS. Its major finding:** the migration re-ran the demo reset, which on production would wipe the day's demo activity *at deploy time*. Claude removed it; locally, `seed.sql` now re-seeds after every reset.
- **Its other findings, all applied:**
  - The address check now requires non-empty fields and an ISO country code, and no longer requires a ZIP (some countries have none). pgTAP cases cover each rule.
  - The shipment-id index is now **unique**, a second guard against buying two labels.
- **A test bug Claude found:** psql variables aren't expanded inside `$$` strings, so one test was failing for the wrong reason.

## Outcome
Orders carry a validated shipping address from both Simulate and Checkout. Demo orders only ever hold generated addresses. The order page shows the address, carrier, tracking code and label link (P2-04).

## Follow-ups
- Allow `"zip": null` if a future caller needs it (nit) → when needed
