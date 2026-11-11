---
id: P4-04
title: "HubSpot in the UI"
phase: 4
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P4-04 — HubSpot in the UI

## Goal
The order page links straight to the HubSpot deal, and HubSpot appears on the Connections page like Slack.

## Acceptance criteria
- [x] Order page: 'View deal in HubSpot' link when synced (https only, built from ids, not provider text)
- [x] Connections card works through the generic connected-integration UI
- [x] SSR smoke test

## Files touched
- `app/pages/orders/[id].vue`

## How Claude was used
- **"View deal in HubSpot"** on the order page, built only from numeric ids. A non-numeric value renders as text, and a test checks that a `javascript:` deal id is never linked.
- **The render check caught the SSR timing bug from Phase 1 again.** The portal lookup depended on the order query, so it ran before the order had loaded on the server. Claude moved the lookup into the same request chain.
- The Connections page shows the portal through the generic connected-integration UI with no HubSpot-specific code.

## Outcome
HubSpot is visible on the order page and on Connections.

## Follow-ups
- Visual check → P7
