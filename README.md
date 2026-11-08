# OpsHub

**An order-operations dashboard that shows how to build third-party integrations that don't fall over.**

A single order flows through six real services: a Stripe payment becomes an order in Supabase, gets a shipping label and tracking from EasyPost, shows up as a contact and deal in HubSpot, notifies Slack when it ships or gets stuck, triggers a follow-up email or call through Google, and is summarized by Claude. Every inbound and outbound call is logged, verified, idempotent and retryable from the UI.

> 🚧 In progress. See the [build plan](docs/plan/README.md) for live status.

## What it demonstrates

- **Webhook reliability:** signature verification, store-then-process, idempotency keys, retries with backoff, and rate-limit handling
- **Webhook inspector:** every call with its payload, status, attempts and a manual **Retry** button
- **OAuth connections:** tokens encrypted in Supabase Vault, never exposed to the browser
- **Multi-tenant security:** organizations + memberships enforced by Postgres RLS
- **Live updates:** Supabase Realtime event feed
- **Public demo:** **Try demo** + **Simulate order** run the whole flow against real sandbox APIs, with rate limits, AI usage caps and a nightly reset

## Stack

Nuxt 4 · Nuxt UI · TypeScript · Supabase (Auth, Postgres, RLS, Vault, Realtime, pg_cron) · Vercel · Stripe · EasyPost · HubSpot · Slack · Google APIs · Claude API

## How this was built

This project is built with [Claude Code](https://claude.com/claude-code) as a pair programmer, under explicit human direction and safety rails:

- **Planned before coded.** The architecture, schema and phases were agreed in plan mode first. → [Build plan](docs/plan/README.md) · [Architecture](docs/plan/00-architecture.md) · [Decisions](docs/decisions/)
- **One file per phase and per task.** Each task records how it was verified and **how Claude was used**: which skills ran, what the review agents caught, and which guardrails fired.
- **Guardrails as code** (`.claude/`, unit-tested):
  - **Hooks** block remote database resets, destructive SQL against remote hosts, leaking `.env` secrets, editing applied migrations and server-only code in the client bundle. They also refuse to end a turn while lint, types or tests fail.
  - **Review agents:** `migration-reviewer`, `security-reviewer`, `integration-test-writer`.
  - **Skills** encode the safe path: `new-migration`, `db-reset`, `add-integration`, `webhook-test`, `pre-deploy`, `phase-start`, `task-done`.
- **Production schema changes** go out only through a GitHub Action that needs manual approval.

## Run it locally

Requirements: Node 22+, pnpm, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli), [Stripe CLI](https://docs.stripe.com/stripe-cli).

```bash
pnpm install
pnpm db:start          # local Supabase on ports 563xx
pnpm db:reset          # migrations + seed + pgTAP + types (local only)
cp .env.example .env   # fill in values from `supabase status`
pnpm dev               # http://localhost:3000
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm exec vitest run`, `pnpm db:test`.

## Keeping the demo online

Supabase's free tier pauses after 7 idle days. Two independent pingers (Vercel Cron daily, GitHub Actions every 2 days) record a real database heartbeat, visible at `/api/health`. This is a portfolio workaround: Supabase may change its rules, and the permanent fix is a paid plan. See [ADR 0006](docs/decisions/0006-supabase-keepalive.md).
