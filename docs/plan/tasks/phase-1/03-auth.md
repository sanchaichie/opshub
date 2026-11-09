---
id: P1-03
title: "Auth: sign-up, login, Google, org context"
phase: 1
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P1-03 — Auth: sign-up, login, Google, org context

## Goal
People can sign up and log in with email/password or Google, and every page knows which organization they're working in.

## Acceptance criteria
- [x] `/login` with email/password sign-in + sign-up and a Google button; `/confirm` callback
- [x] App layout with sidebar navigation, user menu, sign-out
- [x] `useOrg()` composable: current org + role, from `memberships`
- [x] `server/utils/auth.ts` (written in P1-04): `requireUser()` and `requireOrgRole(event, orgId, roles)`
- [x] Local: sign-up → logged in with a personal org (email confirmation is off in local config; Mailpit path checked once SMTP exists, P0-07)
- [ ] Google provider wired in `supabase/config.toml` (done, disabled), enabled once the OAuth client exists (P0-07)

## Files touched
- `app/pages/login.vue`, `app/pages/confirm.vue`, `app/layouts/default.vue`
- `app/composables/useOrg.ts`, `server/utils/auth.ts`

## How Claude was used
- **Built with Nuxt UI v4's built-in components:** `UAuthForm` for sign-in and sign-up, plus the `UDashboard*` components for the app shell. That keeps the custom UI code small and consistent. Icon sets are installed locally, so icons are bundled rather than fetched at runtime.
- **Live check against the local stack** (scripted, using the real Supabase Auth API):
  - Signing up "Casey Check" created "Casey Check's workspace", owned by them.
  - RLS returned only that org.
  - A browser attempt to set `is_demo` was denied (42501).
  - `/dashboard` and `/settings` redirect to `/login` when signed out.
  - The dev server log had no errors.
- **Defaults Claude chose:**
  - The selected org is remembered in a cookie, so server rendering shows the same org the user last picked.
  - Google sign-in is configured but switched off, with setup notes in `config.toml`, because it needs the Google OAuth client from P0-07.
  - Local redirect URLs now point at `/confirm`.

## Outcome
People can sign up and sign in with email and password, get their own workspace automatically, and use a dashboard shell with an org switcher and sign-out. Google sign-in is one config flag away.

## Follow-ups
- Turn on Google sign-in (client ID + secret) → P0-07
- Custom SMTP for confirmation emails in production → P0-07
- Server routes to rename the org and invite members → after Phase 1
