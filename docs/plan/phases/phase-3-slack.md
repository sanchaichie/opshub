---
phase: 3
title: Slack + OAuth plumbing
status: planned
started: 
completed:
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
_Created by the phase-start skill when this phase begins._

## Exit criteria
- Connect → notify → disconnect works; tokens never appear in any API response or event payload
- A 429 from Slack is retried after `Retry-After`

## Retrospective
_Written when the phase is done: what changed versus the plan, what was learned._
