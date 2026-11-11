---
id: P6-01
title: "Claude client, error mapping, token budgets"
phase: 6
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P6-01 — Claude client, error mapping, token budgets

## Goal
A Claude client that fits OpsHub's reliability model (our retry rules, not the SDK's) and token-based usage caps that make a public demo safe to run.

## Acceptance criteria
- [x] Official `@anthropic-ai/sdk`, SDK retries off; typed SDK errors mapped to Retryable (429/5xx/connection, with retry-after) and Permanent (other 4xx)
- [x] Model from `NUXT_ANTHROPIC_MODEL` (default `claude-opus-5-5`), explicit low effort, server-side refusal fallbacks on, refusals handled
- [x] Migration: token-weighted counters (`add_usage` / `read_usage`), service-role only, pgTAP
- [x] Caps: global daily token cap, per-IP daily request cap in the demo, per-org daily request cap elsewhere
- [x] Unit tests: error mapping, cap checks

## Files touched
- `server/integrations/claude/*`, `supabase/migrations/*_token_usage.sql`

## How Claude was used
- **Claude Code loaded its Claude API reference** (the `claude-api` skill) before writing any of this, rather than working from memory. That changed three plan decisions:
  - use the **official SDK** rather than raw HTTP
  - default to **`claude-opus-5-5`**, not the cheaper model the plan proposed; the cost trade-off is the owner's to make, so it's surfaced in `.env.example` and ADR 0008
  - enable **server-side refusal fallbacks**, with explicit `low` effort
- **The SDK fits OpsHub's retry model:** its retries are off, and its typed errors are mapped to Retryable (408/409/429/5xx/529 and connection, with `retry-after`) or Permanent. The unit tests stub `fetch` and return real HTTP statuses, so they exercise the SDK's genuine errors, and they confirm a 429 causes exactly **one** request.
- **Prompt caching was considered and skipped:** the system prompts are below the minimum cacheable size, so caching would silently do nothing.
- **Token budgets:**
  - A new migration adds token-weighted counters.
  - **migration-reviewer: APPROVE WITH NITS.** Applied: an accurate overshoot comment, `tokens:`-prefixed keys enforced, windows over a day refused (the purge would cut them short), and more tests.
  - **security-reviewer**, applied:
    - the cap could be overshot by concurrent requests, and refused or failed calls were never counted. Budgets are now **reserved before each call**.
    - demo and real orgs shared one budget. They are now separate.

## Outcome
A Claude client with OpsHub's retry semantics and per-org token budgets that hold under concurrency and failures.

## Follow-ups
- Live call → when `NUXT_ANTHROPIC_API_KEY` exists
