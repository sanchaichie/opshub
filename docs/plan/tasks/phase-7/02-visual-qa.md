---
id: P7-02
title: "Visual QA with Playwright (phone width, dark mode)"
phase: 7
status: done
started: 2026-11-11
completed: 2026-11-11
commits: []
---

# P7-02 — Visual QA with Playwright (phone width, dark mode)

## Goal
Check every page at desktop and phone width in light and dark mode, signed in with real data, and fix what's broken.

## Acceptance criteria
- [x] Playwright screenshot run of every page × {1280px, 390px} × {light, dark}
- [x] No horizontal scroll at 390px; text readable in dark mode
- [x] Issues found are fixed and re-checked
- [x] Screenshots used in the README

## Files touched
- `tests/e2e/*`, pages as needed

## How Claude was used
- **What the test does:** `tests/e2e/visual.spec.ts` walks the app the way a demo visitor does (landing → Try the demo → every page) at 1280px and 390px, in light and dark mode. It saves a screenshot of each page and asserts nothing overflows.
- **The first version passed while the layout was broken.** It only checked whether the *page* scrolled sideways. Claude looked at the screenshots instead of trusting the green result, and every card on a phone was **clipped at the right edge**: borders gone, "Succeeded" and prices cut off. The page didn't scroll because the panel clipped its contents.
- **The test was fixed first, made to fail, and only then was the bug fixed.** The detector was rewritten twice:
  - Attempt 1 exempted anything inside a scroll container. It still passed, because in CSS a vertically scrolling panel also counts as a horizontal scroller, so the exemption hid exactly the bug.
  - Attempt 2 flags any container whose content is wider than it, except deliberate table scrollers and ellipsis text. That one failed, as it should.
- **The real causes**, found by measuring in the browser rather than guessing:
  1. `UPageCard` sizes its content to its natural width (`items-start` on its `wrapper` slot), so long rows and ids pushed every card wider than the screen. Fixed once, app-wide, with a theme override in `app/app.config.ts`.
  2. Page grids written as `grid lg:grid-cols-3` give phones one *auto* column that grows to fit its widest unbreakable content. Fixed with `grid-cols-1` and `min-w-0`.
- **Also found and fixed from the screenshots:**
  - a "Chicago , IL" spacing bug in addresses
  - the orders table hid its **Status** column off-screen on phones, so columns were reordered with the most useful first
  - the Orders page title was crushed to "Orc" by two buttons, so Test Checkout is icon-only on phones
- **Making the test reliable:**
  - replaced `networkidle`, which never settles with a dev server's live-reload socket
  - the demo click is retried until it navigates, because a click before hydration does nothing
  - tests run serially, because every run logs into the rate-limited demo
- **Honest note:** one of Claude's own debugging scripts was itself rate-limited by the demo login limit. That's the limit working as designed.

## Outcome
All 8 pages pass at desktop and phone width in light and dark mode, and look right on inspection. Representative screenshots are in `docs/screenshots/` for the README. Run it with `pnpm test:e2e` against a running dev server.

## Follow-ups
- Run the visual QA in CI (it needs the app running against a seeded Supabase) → after deployment
