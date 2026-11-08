# OpsHub

An order-operations dashboard that demonstrates reliable third-party integrations: Stripe → Supabase → EasyPost → HubSpot → Slack → Gmail/Calendar → Claude. It's deployed publicly with a demo mode. **Prospective clients read this repo**, so clarity matters as much as features.

- Architecture, schema and phases: `docs/plan/00-architecture.md`
- Current status: `docs/plan/README.md`
- Decisions: `docs/decisions/`

## Stack
Nuxt 4 (`app/`, `server/`, `shared/`) · Nuxt UI v4 · TypeScript strict (pinned to 5.9) · `@nuxtjs/supabase` · Supabase (Postgres, RLS, Vault, Realtime, pg_cron) · Vitest + pgTAP · pnpm · Vercel.

## Commands
| | |
|---|---|
| `pnpm dev` | Dev server on :3000 (needs `.env`; see `.env.example`) |
| `pnpm lint` / `pnpm lint:fix` | ESLint (stylistic rules, no Prettier) |
| `pnpm typecheck` | `nuxt typecheck` (vue-tsc) |
| `pnpm exec vitest run` | Unit tests (`tests/**`) |
| `pnpm db:start` | Start the local Supabase stack (ports 563xx) |
| `pnpm db:reset` | **The only way to reset a DB.** Local only: migrations + seed + pgTAP + types |
| `pnpm db:test` | pgTAP tests (`supabase/tests`) |
| `pnpm db:types` | Regenerate `shared/types/database.types.ts` |
| `stripe listen --forward-to localhost:3000/api/webhooks/stripe` | Local Stripe webhooks (test mode) |

## Database safety (non-negotiable)
- **Resets:** only the **local** stack is ever reset, and only through `pnpm db:reset` (it asserts the target is local first). Never run `supabase db reset` directly, never with `--linked`/`--db-url`, and never invent another way to reset a remote DB.
- **Prod demo data:** reset only by `select private.reset_demo_data();`, which touches `is_demo` orgs only.
- **Prod migrations:** go out only through the `Deploy migrations` GitHub Action, after manual approval. Don't `supabase db push` from a laptop.
- **Schema changes:** always a **new** migration (use the `new-migration` skill). Never edit a committed migration.
- **Commit together:** a migration, its pgTAP test and the regenerated types.

## Secrets & data access
- **Secrets are server-only.**
  - Read them with `useRuntimeConfig(event)` in `server/`, never `process.env` in feature code.
  - Only `NUXT_PUBLIC_*` values may reach the browser.
  - New keys go in `.env.example` with empty values and a `NUXT_` prefix.
- **Never read, print or write `.env*` files** (except `.env.example`). The user fills in values.
- **`app/` and `shared/` never import** `#supabase/server`, anything under `server/`, or private runtime config.
- **Data access:**
  - The browser only **reads**, through RLS (`private.is_org_member(org_id)`).
  - Every write goes through a server route that validates input with Zod and calls `requireOrgRole()` before using the service-role client.
- **Tokens:** OAuth tokens live in Supabase Vault (via `server/utils/secrets.ts`) and are never returned by any API or stored in `events` payloads.

## Integration conventions
- **One folder per provider:** `server/integrations/<id>/`, implementing the `Integration` interface and registered in `registry.ts`. Use the `add-integration` skill.
- **Webhooks:** verify (raw body + timestamp) → store the raw event → respond 200 → process later. No side effects before the event is stored.
- **Outbound calls:**
  - Every call goes through `enqueue()` + `http.ts`, with a deterministic idempotency key (`` `${provider}.${action}:${orderId}` ``).
  - Modules never log or retry on their own. The core does it.
- **Provider payloads:** parse every one with Zod. Unknown statuses map to a safe default and are logged.

## Code style
- **TypeScript:** strict, no `any`, small functions, named exports in `server/utils`.
- **Comments:** say *why*, not *what*. The code is read by clients.
- **Server routes:** follow `<name>.<method>.ts` naming. Return typed objects, and use `createError()` for failures without leaking internals.
- **Tests:** build fake credentials at runtime (`'sk_' + 'test_' + 'x'.repeat(24)`) so no file contains a real-looking key. The file guard blocks those.

## Workflow
- **Tracking:** one file per phase and per task in `docs/plan/`. Use the `phase-start` skill to begin a phase and `task-done` to finish a task. Keep "How Claude was used" concrete and honest.
- **Review:**
  - Run `migration-reviewer` on every migration.
  - Run `security-reviewer` on server, integration and auth changes.
  - Run `pre-deploy` before merging to `main`.
- **Commits:** author is **sanchaichie** (already set in this repo's git config). Use conventional commits with the task ID, e.g. `feat(stripe): verify webhook signatures [P1-04]`. Commit or push only when the user asks.

## Guardrails (already active; `.claude/settings.json`)
- **Hooks:** `.claude/hooks/` blocks dangerous shell commands and file access, lint-fixes edited files, and won't let a turn end while lint, typecheck or tests fail.
- **If a hook blocks you:** follow its message (it names the safe alternative). Don't work around it. If you believe it's wrong, tell the user.
- **Changing a rule:** rules live in `.claude/hooks/lib/*-rules.mjs` and are covered by `tests/hooks/`. Any change needs a test.
