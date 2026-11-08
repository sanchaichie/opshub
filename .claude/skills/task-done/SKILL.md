---
name: task-done
description: Close out an OpsHub task - verify acceptance criteria, record how Claude was used, link commits, mark the task done and roll status up to the phase and plan index. Use when a task's work is finished.
---

# Finish a task

## 1. Verify
1. Open the task file in `docs/plan/tasks/phase-<N>/`.
2. Run each acceptance criterion and tick only the ones that actually pass. If any fail, stop and report. **Do not mark the task done.**
3. Run `pnpm lint`, `pnpm typecheck` and `pnpm exec vitest run`. If SQL changed, also run `pnpm db:reset` (db-reset skill).

## 2. Record
Fill in the task file:
- **Frontmatter:** `status: done`, `completed: <today>`, `commits: [<short sha>, ...]` (from `git log --oneline` for this task's commits, if they exist yet).
- **"How Claude was used":** be concrete and honest. This section is shown to clients.
  - Which skills ran (e.g. new-migration, webhook-test).
  - Which agents reviewed what, and what they caught (e.g. "migration-reviewer flagged a missing FK index on `events.order_id`").
  - Which hooks fired and why (e.g. "guard-bash blocked a direct `supabase db reset`; switched to `pnpm db:reset`").
  - What the human decided or corrected.
- **"Outcome":** what now works, in one short paragraph.
- **"Follow-ups":** anything deferred, with the task it belongs to.

## 3. Roll up
- In the phase file, tick the task in its task list.
- If every task in the phase is done:
  - Set the phase to `status: done` and `completed: <today>`.
  - Write its **Retrospective**: what changed versus the plan, and what was learned.
- Update the table and the "Now" line in `docs/plan/README.md`.
- If the architecture changed, add a dated changelog entry to `docs/plan/00-architecture.md`. Add an ADR in `docs/decisions/` if a real decision was made.

## 4. Commit (only if the user has asked you to commit)
```
docs(plan): complete P<N>-<NN> <slug>
```
Feature commits for the task carry the ID in the subject, e.g. `feat(stripe): verify webhook signatures [P1-04]`.
