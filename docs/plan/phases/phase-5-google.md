---
phase: 5
title: Gmail + Google Calendar
status: done
started: 2026-11-11
completed: 2026-11-11
---

# Phase 5 — Gmail + Google Calendar

## Goal
After delivery, send a follow-up email from the connected Gmail account; let the user book a follow-up call on Google Calendar.

## Scope
- OAuth (`gmail.send`, `calendar.events`) + refresh
- Follow-up email on `delivered`; Book-a-call creates a Calendar event with a Meet link
- Demo: email only to `NUXT_DEMO_EMAIL_ALLOWLIST`

## Out of scope
- Google app verification (the app stays in testing mode)

## Tasks
- [x] [P5-01 Google OAuth (Gmail + Calendar)](../tasks/phase-5/01-google-oauth.md)
- [x] [P5-02 Follow-up email on delivery](../tasks/phase-5/02-follow-up-email.md)
- [x] [P5-03 Book a call (Google Calendar)](../tasks/phase-5/03-book-a-call.md)
- [x] [P5-04 Google in the UI + demo](../tasks/phase-5/04-google-ui.md)

## Exit criteria
- Delivered order sends exactly one email (idempotent)
- Demo mode can't email anyone outside the allowlist

## Retrospective
**Done locally on 2026-11-11. Live Gmail/Calendar runs are pending the Google OAuth client.**

**Changed versus the plan**
- **Demo email goes to the first allowlisted address**, not merely "only to allowlisted addresses". A visitor can't choose among them.
- **Demo Google actions have shared hourly and daily caps,** not only per-IP limits.

**What the process caught**
- **security-reviewer:** the missing overall abuse cap. Claude had added an hourly cap while the review ran; the review's route-level daily and per-order caps were added too.

**Learned**
- **Some APIs can't be made exactly-once.** Gmail send has no idempotency key. The right move is to shrink the window, enforce once-per-order upstream, and document the remaining at-least-once behaviour.
