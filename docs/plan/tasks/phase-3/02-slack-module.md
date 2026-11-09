---
id: P3-02
title: "Slack notifications"
phase: 3
status: done
started: 2026-11-10
completed: 2026-11-10
commits: []
---

# P3-02 — Slack notifications

## Goal
Orgs that connect Slack get a message in the channel they picked whenever an order ships, is delivered, fails or gets stuck.

## Acceptance criteria
- [x] `server/integrations/slack/`: OAuth v2 with `incoming-webhook` (Slack's own channel picker), `notify_order` action posting Block Kit with a link back to the order
- [x] `order-flow.onOrderStatusChanged` enqueues a notification for in_transit, delivered, exception and stuck when the org has Slack connected; one message per transition (idempotency key per status-history row)
- [x] 429 / Retry-After honoured; a revoked webhook (404/410) marks the connection `error` and dead-letters
- [x] Unit tests: message builder, which transitions notify
- [x] Local e2e: a connection whose webhook points at a local capture server receives the right messages
- [ ] Live run against a real Slack workspace (**pending keys**)

## Files touched
- `server/integrations/slack/*`, `server/flows/order-flow.ts`

## How Claude was used
- **Design: Slack's `incoming-webhook` scope.** Slack's own consent screen picks the channel, so there was no picker to build.
- **Design: notifications hook into the order flow.** They hang off `onOrderStatusChanged`, so tracking updates (P2) and stuck detection (P2-03) both trigger them with no extra wiring. Each transition gets its own idempotency key, so a replayed webhook never double-posts.
- **Local e2e without Slack:** a connection pointed at a local capture server.
  - Real signed tracker webhooks produced exactly the shipped and delivered messages.
  - Out-for-delivery stayed quiet, and a replay didn't duplicate.
  - A 404 from "Slack" marked the connection *Needs reconnecting* and dead-lettered the job.
  - The localhost exception exists only in dev builds (`import.meta.dev`). Claude checked the production bundle: the function compiles to `return false`.
- **security-reviewer findings, all applied:**
  - Slack auto-links domains inside text, so a customer name like "Refund at evil.example" would have become a clickable link in the org's channel. Demo visitors control those names, and demo messages go to the owner's channel. Messages now use `verbatim: true`, strip formatting characters and cap name length.
  - The unused Slack access token is no longer stored.
  - `webhook_url` was added to the redaction list.

## Outcome
Orgs that connect Slack get a message in their chosen channel when an order ships, is delivered, hits a delivery problem or gets stuck. Messages link back to the order, are safe against injected formatting, are idempotent per transition, and are capped at 30/hour in the demo.

**Pending keys:** a live run against a real Slack workspace needs the Slack app's client ID and secret.

## Follow-ups
- Live Slack run → when the Slack app exists (P0-07)
