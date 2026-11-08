---
name: phase-start
description: Start the next OpsHub build phase - mark it in progress, break its scope into one task file per task under docs/plan/tasks/phase-N/, and update the plan index. Use when beginning a new phase.
---

# Start a phase

Project tracking lives in `docs/plan/` and is shown to clients, so keep it accurate and readable. See `docs/plan/README.md` for the layout.

## Steps
1. **Check readiness.**
   - Read `docs/plan/README.md` and the previous phase file. The previous phase should be `status: done`.
   - If it isn't, list what's open and ask the user whether to proceed.
2. **Open** `docs/plan/phases/phase-<N>-<slug>.md`. In its frontmatter, set `status: in-progress` and `started: <today YYYY-MM-DD>`.
3. **Break the scope into tasks.** Use 4–8 tasks, each completable and reviewable in one sitting (roughly one PR). For each, create `docs/plan/tasks/phase-<N>/<NN>-<slug>.md` from `docs/plan/tasks/_template.md`:
   - `id: P<N>-<NN>`, `status: planned`, `phase: <N>`
   - Goal: one or two sentences.
   - Acceptance criteria: a checklist of verifiable items. Reuse the phase's exit criteria.
   - Likely files touched.
4. **Link the tasks.** Replace the phase file's "Tasks" section with links to each task file.
5. **Update the index.** In `docs/plan/README.md`, update the phase table (status, started) and the "Now" line.
6. **Confirm with the user.** Show the task list and ask if they want changes before starting P<N>-01.

Don't create task files for future phases. They're created when the phase starts.
