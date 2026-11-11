---
id: P7-04
title: "CI hygiene"
phase: 7
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P7-04 — CI hygiene

## Goal
Clear the GitHub Actions deprecation warnings and make sure CI covers everything the local checks do.

## Acceptance criteria
- [x] Actions bumped off Node 20 (checkout, setup-node, pnpm, supabase setup-cli)
- [ ] CI green on GitHub (checked after the Phase 7 push)

## Files touched
- `.github/workflows/*`

## How Claude was used
- **Bumped what Claude was confident exists:** `actions/checkout` and `actions/setup-node` to v5 (Node 24), rather than guessing version numbers for `pnpm/action-setup` and `supabase/setup-cli`.
- **The push's CI run shows whether any Node 20 warnings remain** (recorded in the phase retrospective).

## Outcome
CI uses current action versions where verified.

## Follow-ups
-
