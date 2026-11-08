---
phase: 5
title: Gmail + Google Calendar
status: planned
started: 
completed:
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
_Created by the phase-start skill when this phase begins._

## Exit criteria
- Delivered order sends exactly one email (idempotent)
- Demo mode can't email anyone outside the allowlist

## Retrospective
_Written when the phase is done: what changed versus the plan, what was learned._
