---
phase: 1
title: Auth, schema, Stripe, event log
status: planned
started: 
completed:
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
_Created by the phase-start skill when this phase begins._

## Exit criteria
See [00-architecture.md → Verification (Phase 1)](../00-architecture.md#verification-phase-1-done).

## Retrospective
_Written when the phase is done: what changed versus the plan, what was learned._
