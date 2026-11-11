---
phase: 6
title: Claude AI assist
status: done
started: 2026-11-11
completed: 2026-11-11
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
- [x] [P6-01 Claude client, error mapping, token budgets](../tasks/phase-6/01-claude-client.md)
- [x] [P6-02 Summarize order + draft reply](../tasks/phase-6/02-ai-endpoints.md)
- [x] [P6-03 AI assist on the order page](../tasks/phase-6/03-ai-ui.md)
- [x] [P6-04 Review + live check](../tasks/phase-6/04-ai-review.md)

## Exit criteria
- Summary and draft render on the order page
- Caps return a friendly 429 once exceeded

## Retrospective
**Done locally on 2026-11-11. The live Claude call is pending an API key.**

**Changed versus the plan**
- **Model default:** `claude-opus-5-5`, per Anthropic's guidance. The plan's "Haiku-class to keep costs down" is now an explicit owner choice (ADR 0008).
- **AI calls are synchronous** (someone is waiting) rather than queued. They are still logged against the order.
- **Token budgets are per org, plus one for the demo,** reserved before each call. The plan had a single global cap checked afterwards.

**What the process caught**
- **Loading the Claude API reference first** changed the client design (SDK, fallbacks, effort) before any code existed.
- **security-reviewer:**
  - demo visitors could see each other's AI output (a phishing vector)
  - the cap could be overshot under concurrency and missed failed calls
  - demo and real orgs shared one budget
- **The e2e:** synchronous calls weren't linked to their orders.

**Learned**
- **For paid APIs, the budget has to count before the call, not after.** Anything that only adds up successful calls can be overrun by failures or concurrency.
