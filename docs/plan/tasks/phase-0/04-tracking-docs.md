---
id: P0-04
title: Project tracking + docs
phase: 0
status: done
started: 2026-11-08
completed: 2026-11-08
commits: []
---

# P0-04 — Project tracking + docs

## Goal
Make the plan → phase → task structure visible in the repo (one file each) so a client can see how the project was planned and built. Write CLAUDE.md, the README and the first ADRs.

## Acceptance criteria
- [x] `docs/plan/README.md` index with a phase table and a "Now" line
- [x] `docs/plan/00-architecture.md`: the approved plan plus a dated changelog
- [x] One file per phase (0–7) with frontmatter status, scope, exit criteria and a retrospective section
- [x] One file per Phase 0 task; a task template for later phases
- [x] ADRs for the key decisions in `docs/decisions/`
- [x] CLAUDE.md with commands, conventions and the safety rules
- [x] The SessionStart hook reads `status: in-progress` from these files

## Files touched
- `docs/plan/**`, `docs/decisions/*.md`, `CLAUDE.md`, `README.md`

## How Claude was used
- **Planning in Claude Code's plan mode.** Before writing any code, Claude asked four multiple-choice questions: demo-mode behavior, where the integration code runs, which chat tool, and the deploy target. The human's answers became ADRs 0001–0004.
- **The plan grew over three review rounds, each driven by the human:**
  1. Add hooks, subagents and skills, with special care for DB resets.
  2. Track the plan, phases and tasks one file each, so the process can be shown to clients.
  3. Add a keep-alive so the free Supabase tier never pauses.
- **Kept honest by design.** Task files for future phases are created only when that phase starts (`phase-start` skill), so there are no stale stubs.

## Outcome
The repo documents its own process. The `phase-start` and `task-done` skills keep the docs current as work happens.

## Follow-ups
- README architecture diagram → P7
