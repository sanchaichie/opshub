---
phase: 2
title: EasyPost shipping
status: planned
started: 
completed:
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
_Created by the phase-start skill when this phase begins._

## Exit criteria
- Simulate order reaches `delivered` (or `exception`) with full status history
- Replayed tracker webhook is a no-op
- An order with no tracking update past the threshold becomes `stuck`

## Retrospective
_Written when the phase is done: what changed versus the plan, what was learned._
