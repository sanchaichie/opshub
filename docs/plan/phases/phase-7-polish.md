---
phase: 7
title: Polish
status: done
started: 2026-11-11
completed: 2026-11-11
---

# Phase 7 — Polish

## Goal
Make the repo and demo client-ready: prove extensibility, document the architecture, and add an end-to-end smoke test.

## Scope
- Discord module (webhook-URL connection) as the interface proof
- README architecture diagram, flow walkthrough, how to add an integration
- Playwright smoke test: Simulate → delivered
- Optional Sentry

## Out of scope
- New features

## Tasks
- [x] [P7-01 Discord: proving the plug-in interface](../tasks/phase-7/01-discord.md)
- [x] [P7-02 Visual QA with Playwright](../tasks/phase-7/02-visual-qa.md)
- [x] [P7-03 README](../tasks/phase-7/03-readme.md)
- [x] [P7-04 CI hygiene](../tasks/phase-7/04-ci-hygiene.md)
- [x] [P7-05 Launch checklist](../tasks/phase-7/05-launch-checklist.md)

## Exit criteria
- Adding Discord touched only its own folder, the registry and the Connections card
- Smoke test runs in CI

## Retrospective
**Done on 2026-11-11.**

**Changed versus the plan**
- **Discord took more than "about one file".** Discord itself was 2 files plus 2 one-line hooks. Being the first paste-to-connect integration, it also added generic `manualConnect` plumbing that the next one reuses.
- **The planned Playwright smoke test of Simulate → delivered became visual QA of every page.** Simulate needs live Stripe keys, and the phone/dark-mode check had been deferred since Phase 1.
- **Sentry was deferred.** Errors are already visible in the event inspector and Vercel's logs. Adding a third-party error tracker is a decision for after launch.

**What the process caught**
- **The visual QA's first green run was wrong.** Claude looked at the screenshots, found every card clipped on phones, made the test fail on it first, then fixed the two root causes.
- **security-reviewer:** following redirects could undo URL allowlists. Redirects are now refused by default for every outbound call, and the outbound flows were re-run after that global change.

**Learned**
- **A passing check is only as good as what it measures.** Look at the output, then make the test fail on what you saw before fixing it.
