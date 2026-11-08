---
id: P0-01
title: Scaffold the Nuxt app
phase: 0
status: done
started: 2026-11-08
completed: 2026-11-08
commits: []
---

# P0-01 — Scaffold the Nuxt app

## Goal
A minimal Nuxt 4 app with Nuxt UI, `@nuxtjs/supabase`, ESLint (stylistic), Vitest and strict TypeScript. It lints, typechecks and runs against the local Supabase stack.

## Acceptance criteria
- [x] `pnpm lint` and `pnpm typecheck` pass
- [x] `pnpm dev` serves `/`, and protected routes redirect to `/login`
- [x] No runtime errors in the dev server log

## Files touched
- `package.json`, `nuxt.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `tsconfig.json`
- `app/app.vue`, `app/pages/index.vue`, `app/assets/css/main.css`
- `shared/types/database.types.ts` (generated)

## How Claude was used
- Claude scaffolded the app from the official `minimal` template into a scratch directory, then copied it in. Scaffolding in place risked `--force` wiping the existing `.git` and its per-repo GitHub account config.
- **Two dependency problems, both caught by running the tools rather than assuming they worked:**
  - **TypeScript 7.** The fresh install pulled TS 7, which typescript-eslint and vue-tsc don't support yet. Lint failed, and TS was pinned to 5.9.
  - **h3 version split.** The dev-server log showed `event.req.headers.get is not a function`. Claude traced it with `pnpm why h3` to `@nuxt/test-utils` pulling in h3 v2 next to Nuxt's h3 v1. The fix was to drop test-utils for now and declare h3 v1 explicitly. The log was then clean.
- The human chose the stack and the decisions recorded in the ADRs during planning.

## Outcome
The skeleton app runs against local Supabase with zero errors. Auth redirects work.

## Follow-ups
- Re-add `@nuxt/test-utils` with Playwright once it works alongside h3 v1 → P7
