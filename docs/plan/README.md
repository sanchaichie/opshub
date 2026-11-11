# OpsHub build plan

How this project was planned and is being built, with [Claude Code](https://claude.com/claude-code) as a pair programmer under human direction. Every phase and task has its own file. Each task records what was built, how it was verified, and **how Claude was used**: which skills and review agents ran, what they caught, and which guardrails fired.

**Now:** all phases built and tested locally. Next: going live with the [launch checklist](../launch-checklist.md), which also lists each integration's pending live check. Phase 0 is done except [P0-07 Cloud setup](tasks/phase-0/07-cloud-setup.md), deferred until the accounts exist.

## Phases

| # | Phase | Status | Started | Completed |
|---|---|---|---|---|
| 0 | [Scaffold + guardrails](phases/phase-0-scaffold-guardrails.md) | 🟠 Done locally, cloud setup deferred | 2026-11-08 | |
| 1 | [Auth, schema, Stripe, event log](phases/phase-1-auth-stripe-event-log.md) | 🟠 Done locally, live Stripe run pending keys | 2026-11-09 | 2026-11-09 |
| 2 | [EasyPost shipping](phases/phase-2-easypost.md) | 🟠 Done locally, live EasyPost run pending keys | 2026-11-09 | 2026-11-09 |
| 3 | [Slack + OAuth plumbing](phases/phase-3-slack.md) | 🟠 Done locally, live Slack run pending app keys | 2026-11-10 | 2026-11-10 |
| 4 | [HubSpot CRM](phases/phase-4-hubspot.md) | 🟠 Done locally, live HubSpot run pending a test portal | 2026-11-10 | 2026-11-11 |
| 5 | [Gmail + Google Calendar](phases/phase-5-google.md) | 🟠 Done locally, live Google runs pending OAuth client | 2026-11-11 | 2026-11-11 |
| 6 | [Claude AI assist](phases/phase-6-claude.md) | 🟠 Done locally, live call pending API key | 2026-11-11 | 2026-11-11 |
| 7 | [Polish](phases/phase-7-polish.md) | ✅ Done | 2026-11-11 | 2026-11-11 |

## How the docs are organized

```
docs/
├─ plan/
│  ├─ README.md                 ← you are here: status at a glance
│  ├─ 00-architecture.md        ← the approved plan + dated changelog
│  ├─ phases/phase-N-<slug>.md  ← goal, scope, task list, exit criteria, retrospective
│  └─ tasks/phase-N/NN-<slug>.md← one file per task, incl. "How Claude was used"
└─ decisions/NNNN-<slug>.md     ← architecture decision records (ADRs)
```

## Workflow

1. **Plan:** the whole project was planned first in Claude Code's plan mode. Claude asked clarifying questions, the human made the calls (recorded as [ADRs](../decisions/)), and the plan was revised over three rounds of feedback before any code was written.
2. **Start a phase:** the `phase-start` skill breaks the phase into task files, so future work isn't stubbed out early.
3. **Do a task:** skills encode the safe path (`new-migration`, `add-integration`, `webhook-test`, `db-reset`). Review agents check the work (`migration-reviewer`, `security-reviewer`, `integration-test-writer`). Hooks block dangerous actions and refuse to end a turn while lint, types or tests are failing.
4. **Finish a task:** the `task-done` skill checks the acceptance criteria, records how Claude was used and the commits, and rolls status up to the phase and this index.

Commits reference task IDs, e.g. `feat(stripe): verify webhook signatures [P1-04]`.
