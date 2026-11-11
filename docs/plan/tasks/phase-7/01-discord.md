---
id: P7-01
title: "Discord: proving the plug-in interface"
phase: 7
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P7-01 — Discord: proving the plug-in interface

## Goal
Add Discord notifications as a second chat target, connected by pasting a webhook URL, and measure honestly how much of the codebase that touched.

## Acceptance criteria
- [x] `server/integrations/discord/`: `notify_order` posting embeds to a validated `https://discord.com/api/webhooks/…` URL; 429 + Retry-After handled
- [x] Connect by webhook URL (owner/admin, demo forbidden), stored in Vault like OAuth credentials
- [x] Notifications fire on the same transitions as Slack
- [x] Unit tests + local e2e against a capture server
- [x] An honest count of files touched outside `server/integrations/discord/`

## Files touched
- `server/integrations/discord/*`, registry, order-flow, connections

## How Claude was used
- **Security built in from the start**, informed by the Slack review in Phase 3:
  - every message sets `allowed_mentions: { parse: [] }`, so a customer named "@everyone" can't ping a whole server
  - Discord markdown is escaped, including masked links `[text](url)`
  - pasted URLs must be real `https://discord.com/api/webhooks/<id>/<token>` endpoints and are checked to exist before being stored
- **Local e2e** with a capture server:
  - real signed tracker webhooks produced exactly the shipped and delivered messages, with mentions disabled
  - a replay didn't duplicate
  - a deleted webhook (404) flagged the connection and dead-lettered the job
  - members and demo visitors can't connect or disconnect
  - pasting a cloud-metadata URL (`http://169.254.169.254/…`, an SSRF attempt) is rejected with a clear message

**The honest file count.** The plan predicted Discord would take "about one file".
- **Discord itself:** `server/integrations/discord/` (2 files), **one line** in `registry.ts`, and **one entry** in `CHAT_TARGETS` in `order-flow.ts`.
- **Plus one-time plumbing**, because Discord is the first integration that connects by *pasting a secret* rather than OAuth:
  - a `manualConnect` hook on the `Integration` interface (`types.ts`)
  - a generic `POST /api/connections/[provider]` route
  - `manual` fields in `integrations.get.ts`
  - a paste form on the Connections page
- **The next paste-based integration** would reuse all of that and need only its folder and a registry line.

## Outcome
Discord notifications work alongside Slack, and OpsHub now supports two ways to connect an integration (OAuth, or pasting a secret), both storing credentials only in Vault.

**Pending:** a live run against a real Discord webhook. That doesn't need any OpsHub keys: an owner can paste a webhook URL from any Discord server.

## Follow-ups
-
