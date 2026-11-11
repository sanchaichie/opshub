---
id: P5-03
title: "Book a call (Google Calendar)"
phase: 5
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P5-03 — Book a call (Google Calendar)

## Goal
From an order page, a team member books a 30-minute call with the customer, with a Google Meet link, and can't accidentally book it twice.

## Acceptance criteria
- [x] `POST /api/orders/[id]/book-call` (members; validated future time) → `google.book_call` action
- [x] Calendar event with a deterministic event id (retry-safe), a Meet link (`conferenceData`), the customer as attendee (demo: allowlist only)
- [x] Result (time + Meet link) recorded on the event and shown on the order
- [x] Unit tests: event id format, payload, demo attendee rule

## Files touched
- `server/api/orders/[id]/book-call.post.ts`, `server/integrations/google/*`

## How Claude was used
- **Retry-safe booking:** the Calendar event id is derived from order + start time, so a retried booking hits a 409 and re-uses the existing event. The Meet request uses the same id, so no second Meet room is created. In the live check, a double-clicked booking produced a single job.
- **Guards, verified live:** signed out → 401, Google not connected → 409, a time in the past → 422.
- **security-reviewer: PASS WITH NITS.** No path for a demo visitor to email or invite anyone outside the allowlist, and no cross-org booking. Applied:
  - demo bookings have a shared daily cap (50) and a per-order cap (3), on top of the per-IP limit, so rotating IPs can't flood the owner's calendar
  - the route now authenticates before validating input

## Outcome
Team members can book a 30-minute call with a Meet link from any order. A retry or double-click can't create a second meeting.

## Follow-ups
- Live Calendar booking → P0-07
