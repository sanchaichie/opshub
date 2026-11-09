---
phase: 3
title: Slack + OAuth plumbing
status: done
started: 2026-11-10
completed: 2026-11-10
---

# Phase 3 — Slack + OAuth plumbing

## Goal
The first connected integration: an org connects Slack through OAuth and gets notified when orders ship, deliver, fail or get stuck.

## Scope
- Generic OAuth: signed single-use state, Vault token storage, reusable connect/disconnect UI
- Slack app (`chat:write`), channel picker
- Block Kit notifications linking back to the order

## Out of scope
- Slash commands or interactive Slack actions

## Tasks
- [x] [P3-01 Generic OAuth connect/disconnect](../tasks/phase-3/01-oauth-plumbing.md)
- [x] [P3-02 Slack notifications](../tasks/phase-3/02-slack-module.md)
- [x] [P3-03 Connect and disconnect in the UI](../tasks/phase-3/03-connections-ui.md)
- [x] [P3-04 Slack in the public demo](../tasks/phase-3/04-demo-slack.md)

## Exit criteria
- Connect → notify → disconnect works; tokens never appear in any API response or event payload
- A 429 from Slack is retried after `Retry-After`

## Retrospective
**Done locally on 2026-11-10. The live Slack run is pending the Slack app.**

**Changed versus the plan**
- **OAuth state is random and stored server-side**, bound to the browser by a cookie, rather than HMAC-signed. No state-signing secret is needed.
- **Slack uses `incoming-webhook`.** Slack's own consent screen is the channel picker.
- **The demo org is connected by a one-off owner script** rather than OAuth, because demo visitors are throwaway accounts.

**What the process caught**
- **security-reviewer:**
  - Slack auto-linking hidden in customer names
  - a URL-driven fake success toast
  - an unused stored token
- **migration-reviewer:** an unbounded sweep and a provider check that only existed in TypeScript.
- **A failing test** caught a misremembered RFC test vector.

**Learned**
- **Any text that reaches a third-party renderer** (Slack's mrkdwn) is an injection surface of its own: escaping HTML-like characters wasn't enough.
