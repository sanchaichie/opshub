# ADR 0007: Each demo visitor gets a throwaway account in the shared demo org

- **Status:** Accepted (refines ADR 0002)
- **Date:** 2026-11-09

## Context
The original plan was a single seeded demo account that every "Try demo" visitor signs into. The security review of P1-07 showed that a shared account lets any one visitor act on *everyone's* session:
- Supabase's sign-out revokes **all** sessions of a user by default, so a visitor clicking "Sign out", or calling the Auth API on purpose, would log out every other visitor.
- Any visitor could change the shared account's password, or try to change its email.
- The account needed a password stored in env vars, and a misconfigured email could point at a real person's account.

## Decision
`POST /api/demo/login` creates a fresh account for each visitor and signs them in server-side.
- Each account gets a random `@demo.example.com` email, a random password that is used once and never stored, and `app_metadata.demo = true`.
- Each account is a `member` of the one shared demo org, so every visitor sees the same live demo data.
- The nightly `reset_demo_data()` deletes visitor accounts older than a day, plus any workspace only they belong to. The key is `app_metadata.demo`, which users can't set themselves.
- The route refuses cross-site requests (Origin check) and is rate-limited per IP (10/hour) and globally (1,000/day).

## Consequences
- Sign-out, password and email changes only ever affect the visitor's own throwaway account. Verified live: a global sign-out by one visitor left another visitor's session working.
- There is no demo password to configure, leak or misconfigure, so `NUXT_DEMO_USER_EMAIL`/`PASSWORD` are gone.
- `auth.users` grows by up to 1,000 rows a day before the nightly purge, which is fine at this scale.
- The visitor experience is unchanged from the original plan: one click into a shared, live demo store.
