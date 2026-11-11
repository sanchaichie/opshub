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
- [x] CI green on GitHub

## Files touched
- `.github/workflows/*`

## How Claude was used
- **Bumped what Claude was sure existed first:** `actions/checkout` and `actions/setup-node` to v5 (Node 24), rather than guessing version numbers for `pnpm/action-setup` and `supabase/setup-cli`.
- **The first push still warned about `pnpm/action-setup@v4` and `supabase/setup-cli@v1`.** Claude checked those repos' actual releases rather than guessing, found `pnpm/action-setup` v6 (Node 24) and `supabase/setup-cli` v3 (a composite action, so no Node runtime), and pinned specific releases at least a few weeks old (`v6.1.0`, `v3.0.1`) rather than the newest.

## Outcome
CI uses current action versions where verified.

## Follow-ups
-
