---
id: P2-04
title: "Shipping in the UI"
phase: 2
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P2-04 — Shipping in the UI

## Goal
Shipping is visible where people look: address, carrier, tracking and label on the order page, and EasyPost on the Connections page.

## Acceptance criteria
- [x] Order page: shipping address, carrier + tracking code, label link
- [x] Connections: EasyPost shows configured / keys missing and its webhook URL
- [x] Dashboard 'Needs attention' includes stuck and exception orders (already counted) with a link
- [x] SSR smoke test covers the new fields

## Files touched
- `app/pages/orders/[id].vue`, `app/pages/connections.vue`, `server/api/integrations.get.ts`

## How Claude was used
- Added a Shipping card to the order page: address, carrier, tracking code and label link.
- **Label links are https-only.** Provider-supplied URLs are validated on the way in and checked again before being rendered as a link.
- EasyPost appears on the Connections page through the existing integrations endpoint, which reports only configured / keys missing.
- **Smoke test:** the server-render smoke test was extended. A seeded demo order renders its address, carrier and tracking code for a signed-in demo visitor.

## Outcome
Shipping is visible where people look, and nothing provider-supplied can turn into an unsafe link.

## Follow-ups
- Visual check (phone width, dark mode) → P7
