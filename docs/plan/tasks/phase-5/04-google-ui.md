---
id: P5-04
title: "Google in the UI + demo"
phase: 5
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P5-04 — Google in the UI + demo

## Goal
The order page shows the follow-up status and a 'Book a call' form; the demo org can be connected by the owner.

## Acceptance criteria
- [x] Order page: follow-up status, 'Book a call' form, booked calls with their Meet links (https-only)
- [x] `scripts/connect-demo-google.sh` for the owner, mirroring the Slack one
- [x] SSR smoke test; security-reviewer
- [ ] Live run against a Google test user (**pending keys**)

## Files touched
- `app/pages/orders/[id].vue`, `scripts/connect-demo-google.sh`

## How Claude was used
- **Customer follow-up card** on the order page: the follow-up email's status, booked calls with **Meet links rendered only if they're real `https://meet.google.com/…` links** (verified live: a `javascript:` link isn't linked), and a booking form shown only when Google is connected.
- **`scripts/connect-demo-google.sh`:** mirrors the Slack script. It stores only a refresh token, marked to refresh on first use. Tested locally.

## Outcome
Google features are usable from the order page, and the demo can be connected by the owner.

## Follow-ups
- Visual check → P7
