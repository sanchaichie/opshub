---
id: P6-03
title: "AI assist on the order page"
phase: 6
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P6-03 — AI assist on the order page

## Goal
An 'AI assist' card on the order page: summarize, draft a reply from a pasted customer message, copy the draft.

## Acceptance criteria
- [x] Card with Summarize and Draft reply, latest outputs, model + tokens shown, clear messages for caps and refusals
- [x] SSR smoke test

## Files touched
- `app/pages/orders/[id].vue`

## How Claude was used
- **An "AI assist" card on the order page.** The latest summary shows with its model and token count. The draft-reply form has help text that changes in the demo ("don't paste real personal information"). Drafts carry a "check links and claims before sending" note, and output renders as plain text, so links are never clickable.
- **Verified by server-render checks**, with friendly messages for the budget cap (429), Claude being busy (503 with Retry-After), and AI not being configured.

## Outcome
Team members can summarize an order and draft replies for review, in two clicks.

## Follow-ups
- Visual check → P7
