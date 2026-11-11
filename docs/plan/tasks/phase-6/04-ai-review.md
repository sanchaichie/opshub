---
id: P6-04
title: "Review + live check"
phase: 6
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P6-04 — Review + live check

## Goal
Security review of the AI feature and a live run once an API key exists.

## Acceptance criteria
- [x] security-reviewer (prompt injection, data sent to Anthropic, cost abuse)
- [ ] Live run against the Claude API (**pending keys**)

## Files touched
-

## How Claude was used
- **migration-reviewer and security-reviewer both ran**, in parallel. Their findings are recorded in P6-01 and P6-02.
- **Not done yet:** the live call needs an Anthropic API key.

## Outcome
Reviewed. Live run pending a key.

## Follow-ups
- Live run → when `NUXT_ANTHROPIC_API_KEY` exists
