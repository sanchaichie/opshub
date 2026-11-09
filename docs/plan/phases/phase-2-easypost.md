---
phase: 2
title: EasyPost shipping
status: done
started: 2026-11-09
completed: 2026-11-09
---

# Phase 2 — EasyPost shipping

## Goal
Paid orders get a test shipping label automatically, and tracker webhooks move the order through its statuses, including detecting stuck orders.

## Scope
- `easypost.create_shipment` action enqueued on `paid`
- Tracker webhook with HMAC verification + status mapper
- `detect-stuck-orders` pg_cron job
- Simulate drives EasyPost test tracking codes

## Out of scope
- Real carriers or live labels

## Tasks
- [x] [P2-01 Shipping addresses + lookup indexes](../tasks/phase-2/01-shipping-schema.md)
- [x] [P2-02 EasyPost integration: labels + tracker webhooks](../tasks/phase-2/02-easypost-module.md)
- [x] [P2-03 Stuck-order detection](../tasks/phase-2/03-stuck-orders.md)
- [x] [P2-04 Shipping in the UI](../tasks/phase-2/04-shipping-ui.md)

## Exit criteria
- Simulate order reaches `delivered` (or `exception`) with full status history
- Replayed tracker webhook is a no-op
- An order with no tracking update past the threshold becomes `stuck`

## Retrospective
**Done locally on 2026-11-09. The live EasyPost run is pending keys.**

**Changed versus the plan**
- **Stuck detection** runs every 5 minutes (not 15), and only for orders with a real shipment. The reaction runs through a built-in `opshub` integration, so stuck orders reuse the normal order flow.
- **Orders match tracker webhooks on unique ids only:** a new `easypost_tracker_id`, or the shipment id.
- **The worker's fast path chains batches**, so payment → label → tracking happens in seconds rather than at the next minute's sweep.

**What the process caught**
- **security-reviewer:** a cross-tenant bug in Claude's design. Shared test tracking codes would have let one org's tracker move another org's order.
- **migration-reviewer:**
  - a migration that would have wiped demo activity at deploy time
  - a status regression on late `pre_transit` updates
  - duplicate stuck alerts
- **pgTAP:** seeded demo orders would have been flagged stuck after every reset.

**Learned**
- **Test data that's shared by design** (EasyPost's test codes) is exactly where tenant isolation breaks. Matching must use ids that are unique by construction, enforced by the database.
