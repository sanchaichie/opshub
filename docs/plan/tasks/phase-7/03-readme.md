---
id: P7-03
title: "README: architecture, flow walkthrough, adding an integration"
phase: 7
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P7-03 — README: architecture, flow walkthrough, adding an integration

## Goal
Make the README the place a client starts: what OpsHub does, how it's built, one order traced end to end, and how a new integration plugs in.

## Acceptance criteria
- [x] Architecture diagram (Mermaid) and a walkthrough of one order through every integration
- [x] 'Adding an integration' guide grounded in the Discord example
- [x] Reliability features listed with links to the code that implements them
- [x] Links to the build plan and ADRs

## Files touched
- `README.md`

## How Claude was used
- **The README was rewritten for a client reading it cold:**
  - what OpsHub demonstrates, as a table of claims with links to the code that backs each one
  - a Mermaid sequence diagram of one order through every integration
  - an "Adding an integration" guide grounded in the real Discord measurement, including the honest file count
  - a section on how Claude Code was used, citing concrete findings from the review agents
  - screenshots from the visual QA
- **The `add-integration` skill** was updated with what Phase 7 added (`manualConnect`, `withAuthRetry`, `CHAT_TARGETS`), so future sessions follow the same path.

## Outcome
The README is the front door: what, how, where to look, and how it was built.

## Follow-ups
- Replace the status line once deployed
