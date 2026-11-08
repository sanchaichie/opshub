# ADR 0001: Integration code runs in Nuxt server routes, not Supabase Edge Functions

- **Status:** Accepted
- **Date:** 2026-11-08

## Context
Webhook handlers, outbound actions and the retry worker need a server runtime. Supabase Edge Functions (Deno) sit next to the database. Nuxt server routes (Node on Vercel) sit next to the app.

## Decision
All integration code lives in Nuxt server routes. pg_cron + pg_net call a secured `/api/jobs/run` endpoint every minute to process the retry queue. Edge Functions are used only if a specific need comes up.

## Consequences
- One TypeScript codebase and one runtime: types, Zod schemas and utilities are shared with no Deno/Node split.
- Every official Node SDK (Stripe, HubSpot, googleapis, Anthropic) works without polyfills.
- The worker depends on the app being reachable. Webhooks also use a `waitUntil` fast path, so the cron sweeper is only the fallback.
