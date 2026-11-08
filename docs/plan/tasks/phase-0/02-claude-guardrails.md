---
id: P0-02
title: Claude Code guardrails
phase: 0
status: done
started: 2026-11-08
completed: 2026-11-08
commits: []
---

# P0-02 — Claude Code guardrails

## Goal
Make dangerous actions impossible, or gated behind human approval, for any Claude Code session in this repo. Make the safe path the default, through hooks, subagents and skills that are committed with the code.

## Acceptance criteria
- [x] `.claude/settings.json` has deny/ask/allow permission rules and the hook wiring
- [x] **PreToolUse Bash guard** (`guard-bash.mjs`):
  - Denies: remote DB resets, `DROP DATABASE`/core-schema drops, destructive SQL against remote hosts, Stripe `--live`, printing `.env` files or secret variables, `rm -rf` outside the repo or of `.git`/migrations/plan docs, force-pushing `main`.
  - Asks before: `db push`, `migration repair`, `link`, prod deploys, other force pushes, `git reset --hard`.
- [x] **PreToolUse file guard** (`guard-files.mjs`):
  - Blocks: `.env*` (except `.env.example`), edits to committed migrations, writing real-looking credentials for any provider we use, and server-only code under `app/`/`shared/`.
- [x] **PostToolUse** (`post-edit.mjs`): `eslint --fix` on every edited file with errors fed back; migration reminder.
- [x] **Stop** (`verify-on-stop.mjs`): lint + typecheck + unit tests (+ pgTAP when SQL changed) before a turn can end; loop-safe.
- [x] **SessionStart** (`session-context.mjs`): branch, local vs linked DB, current phase/task.
- [x] Both guards fail closed (an internal error means deny).
- [x] Unit tests for both rule sets: 83 tests, all passing.
- [x] Subagents: `migration-reviewer`, `security-reviewer`, `integration-test-writer`.
- [x] Skills: `db-reset`, `new-migration`, `add-integration`, `webhook-test`, `pre-deploy`, `phase-start`, `task-done`.

## Files touched
- `.claude/settings.json`
- `.claude/hooks/*.mjs`, `.claude/hooks/lib/*.mjs`
- `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`
- `tests/hooks/*.test.ts`

## How Claude was used
- The human asked for "hooks, subagents and skills needed to make this project bug free and safe, especially resetting the db". Claude proposed a defense-in-depth design in the plan, and the human approved it before any code was written.
- **Testable by design.** The rules are pure functions (`lib/*-rules.mjs`) with thin stdin/stdout entrypoints.
  - The rules match the whole command string, not just the first word, so chained commands, `$(...)` and `npx`/`pnpm dlx` wrappers are caught too.
- **The guard caught its own author.** As soon as `settings.json` was saved, the Bash guard went live in the session. It then blocked Claude's attempt to write the test file through a shell heredoc, because the heredoc contained `supabase db reset --linked` as test data. Claude switched to the file-writing tool, which is the right channel for file content anyway.
- **Fake credentials in tests** are built by string concatenation, so the secret-scanning file guard doesn't flag the test file itself.
- The PostToolUse hook fired on the first migration and reminded Claude to run the reset script and the migration review.

## Outcome
Every Claude Code session in this repo now inherits the same guardrails as committed project config. They are covered by 83 unit tests.

## Follow-ups
- Run `migration-reviewer` on every Phase 1 migration (enforced by the new-migration skill) → P1
