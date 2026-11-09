---
id: P3-04
title: "Slack in the public demo"
phase: 3
status: done
started: 2026-11-10
completed: 2026-11-10
commits: []
---

# P3-04 — Slack in the public demo

## Goal
The demo org can be pre-connected to the owner's own Slack workspace, so visitors see real Slack messages, without any visitor being able to change or read that connection.

## Acceptance criteria
- [x] `scripts/connect-demo-slack.sh` (owner runs once; stores the webhook in Vault for the demo org)
- [x] Demo notifications are rate-limited (shared budget) so visitors can't flood the owner's channel
- [x] Docs: how to set up the Slack app (redirect URL, scopes) in `README`

## Files touched
- `scripts/connect-demo-slack.sh`, `server/integrations/slack/*`, `README.md`

## How Claude was used
- **The demo org has no owner account** (visitors are throwaway, ADR 0007), so the normal OAuth flow can't connect it, by design.
  - Locally, `scripts/connect-demo-slack.sh` validates the webhook URL and stores it in Vault. The URL is passed to psql on stdin, never on the command line.
  - In production, the owner runs the equivalent SQL (printed at the bottom of the script) in Supabase's SQL editor, consistent with the project rule that nothing writes to the production database from a laptop.
- **Tested:** the script rejects a non-Slack URL and connects the demo org with a valid one.
- **Rate limit:** demo messages are capped at 30 per hour through the shared `bump_usage` counter. Once the cap is hit, notifications are recorded as `ignored` rather than failing.

## Outcome
The public demo can post real Slack messages to the owner's channel, without any visitor being able to change or read that connection.

## Follow-ups
- Connect the production demo org to Slack → P0-07
