---
phase: 6
title: Claude AI assist
status: planned
started: 
completed:
---

# Phase 6 — Claude AI assist

## Goal
Summarize an order's history and draft a customer reply with Claude, with usage caps that make a public demo safe.

## Scope
- Summarize order and Draft reply endpoints
- `ai_outputs` storage, every call logged as an outbound event
- Per-IP and global daily token caps

## Out of scope
- Autonomous agents acting on orders

## Tasks
_Created by the phase-start skill when this phase begins._

## Exit criteria
- Summary and draft render on the order page
- Caps return a friendly 429 once exceeded

## Retrospective
_Written when the phase is done: what changed versus the plan, what was learned._
