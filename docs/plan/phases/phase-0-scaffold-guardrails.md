---
phase: 0
title: Scaffold + guardrails
status: in-progress
started: 2026-11-08
completed:
---

# Phase 0 — Scaffold + guardrails

## Goal
A running Nuxt + Supabase skeleton with every safety net in place **before** any business schema exists: Claude Code hooks, subagents and skills, safe DB scripts, CI, gated prod migrations, a keep-alive, and project tracking.

## Scope
- Nuxt 4, Nuxt UI, @nuxtjs/supabase, ESLint, Vitest, Supabase CLI + pgTAP
- `.claude/` guardrails: hooks, subagents, skills, permission rules
- `scripts/` local-only DB reset
- GitHub Actions: CI, gated migration deploy, keep-alive
- Health endpoint + heartbeat table, Vercel Cron
- CLAUDE.md, README, .env.example, this tracking structure, ADRs
- Cloud projects: GitHub repo, Supabase, Vercel

## Out of scope
- Any business tables (organizations, orders, events…): Phase 1
- Auth UI: Phase 1

## Tasks
- [x] [P0-01 Scaffold the Nuxt app](../tasks/phase-0/01-scaffold-nuxt.md)
- [x] [P0-02 Claude Code guardrails](../tasks/phase-0/02-claude-guardrails.md)
- [x] [P0-03 Local-only database safety](../tasks/phase-0/03-db-safety.md)
- [x] [P0-04 Project tracking + docs](../tasks/phase-0/04-tracking-docs.md)
- [x] [P0-05 CI + gated migration deploys](../tasks/phase-0/05-ci-workflows.md)
- [x] [P0-06 Supabase keep-alive](../tasks/phase-0/06-keepalive.md)
- [ ] [P0-07 Cloud setup: GitHub, Supabase, Vercel](../tasks/phase-0/07-cloud-setup.md)

## Exit criteria
- [x] Hook unit tests pass; dangerous commands are blocked, normal ones pass
- [x] `pnpm db:reset` aborts when the stack is stopped or a remote DB URL is in the environment
- [x] pgTAP passes locally
- [x] CI green on GitHub
- [ ] `/api/health` on the Vercel deploy returns `db: ok`; the cron call records a heartbeat
- [ ] Manually dispatching `keepalive.yml` records a `github-actions` heartbeat

## Retrospective
_Written when the phase is done: what changed versus the plan, what was learned._
