# OpsHub — Architecture & Build Plan

## Context
OpsHub is a portfolio app that demonstrates reliable third-party integrations. It's a small order-operations dashboard with one end-to-end flow: Stripe → Supabase → EasyPost → HubSpot → Slack → Gmail/Calendar → Claude. It's deployed live with a public demo. Reviewers will read the repo, so clarity matters as much as the features.

**Decisions made so far**
- **Demo mode makes real sandbox calls.** The demo org is pre-connected to the owner's own test accounts. Rate limits and caps protect them, and Gmail only ever sends to an allowlisted demo inbox.
- **All integration code runs in Nuxt server routes on Vercel (Node).** pg_cron + pg_net ping a secured worker endpoint every minute. No Edge Functions unless a clear need comes up.
- **Slack first; Discord later** as a small second module that proves the plug-in interface.
- **Tooling:** pnpm, Nuxt 4 (`app/` dir), Nuxt UI v4, Supabase CLI for local dev and migrations, Vitest.

**Key design call: two kinds of integrations**
- **Platform** (Stripe, EasyPost, Claude): the app's own API keys come from env vars. Inbound webhooks carry `org_id` in metadata, which is how they get routed to the right org.
- **Connected** (Slack, HubSpot, Google, Discord): each org connects its own account through OAuth. Tokens are stored in Supabase Vault and never reach the client.

---

## 1. Folder structure
```
opshub/
├─ app/                          # Nuxt 4 client app
│  ├─ pages/
│  │  ├─ index.vue               # landing + "Try demo"
│  │  ├─ login.vue  confirm.vue  # email/password + Google; OAuth callback
│  │  ├─ dashboard.vue           # KPIs + live event feed
│  │  ├─ orders/index.vue  orders/[id].vue   # order timeline, AI summary/reply
│  │  ├─ events/index.vue  events/[id].vue   # webhook inspector, retry
│  │  ├─ connections.vue
│  │  └─ settings.vue            # org + members
│  ├─ components/{orders,events,connections,layout}/
│  ├─ composables/               # useOrg, useRealtimeEvents, useOrders
│  ├─ layouts/  middleware/  app.config.ts
├─ server/
│  ├─ api/
│  │  ├─ webhooks/stripe.post.ts  webhooks/easypost.post.ts
│  │  ├─ oauth/[provider]/start.get.ts  oauth/[provider]/callback.get.ts
│  │  ├─ connections/[provider].delete.ts
│  │  ├─ checkout.post.ts        # real Stripe Checkout session
│  │  ├─ orders/simulate.post.ts
│  │  ├─ orders/[id]/ai.post.ts  # summarize | draft-reply
│  │  ├─ events/[id]/retry.post.ts
│  │  ├─ demo/login.post.ts
│  │  └─ jobs/run.post.ts        # worker, called by pg_cron (bearer CRON_SECRET)
│  ├─ integrations/
│  │  ├─ types.ts                # Integration interface
│  │  ├─ registry.ts             # provider id → module
│  │  ├─ stripe/  easypost/  slack/  hubspot/  google/  claude/  (discord/)
│  │  │   └─ index.ts, webhook.ts, actions.ts, mappers.ts
│  ├─ flows/order-flow.ts        # orchestration: what happens after each domain event
│  └─ utils/                     # Nitro auto-imported
│     ├─ events.ts               # record / enqueue / complete / fail an event
│     ├─ worker.ts               # claim batch, dispatch, backoff
│     ├─ http.ts                 # fetch wrapper: timeout, 429/Retry-After, redaction, attempt logging
│     ├─ secrets.ts              # Vault read/write via RPC
│     ├─ oauth.ts                # signed state, PKCE, token refresh
│     ├─ rate-limit.ts  auth.ts (requireOrgRole)  supabase.ts (service client)
├─ shared/types/                 # database.types.ts (generated) + domain types
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                # timestamped SQL, one concern per file
│  └─ seed.sql                   # demo org, demo user, sample orders/events
├─ supabase/tests/               # pgTAP: RLS isolation, reset_demo_data safety
├─ tests/{unit,integration,hooks}/  # signature verify, backoff, idempotency, mappers, hook guards
├─ scripts/                      # db-reset-local.sh, assert-local-db.sh
├─ docs/
│  ├─ plan/                      # project tracking (see section 7)
│  │  ├─ README.md               # index: phase table, status, links
│  │  ├─ 00-architecture.md      # this plan: decisions, schema, interface
│  │  ├─ phases/phase-N-<slug>.md
│  │  └─ tasks/phase-N/NN-<slug>.md
│  └─ decisions/NNNN-<slug>.md   # ADRs (why Nuxt routes over Edge Functions, etc.)
├─ .claude/
│  ├─ settings.json              # permissions (deny/ask) + hook wiring
│  ├─ hooks/                     # guard-bash, guard-files, post-edit, verify-on-stop, session-context
│  ├─ agents/                    # migration-reviewer, security-reviewer, integration-test-writer
│  └─ skills/                    # new-migration, db-reset, add-integration, webhook-test, pre-deploy
├─ .github/workflows/ci.yml      # lint, typecheck, test
├─ .env.example  CLAUDE.md  README.md  nuxt.config.ts
```

**Integration interface** (`server/integrations/types.ts`):
```ts
interface Integration {
  id: ProviderId
  kind: 'platform' | 'connected'
  oauth?: { authorizeUrl(ctx): string; exchangeCode(ctx, code): Promise<Tokens>; refresh?(t): Promise<Tokens> }
  webhook?: {
    verify(req: RawRequest): Promise<VerifiedWebhook>   // throws on bad signature
    identify(v): { externalId: string; type: string; orgId: string | null }
    handle(evt: StoredEvent, ctx): Promise<void>        // run later by the worker
  }
  actions: Record<string, (ctx: ActionContext, input: unknown) => Promise<ActionResult>>
}
```
Logging is **not** each module's job. The dispatcher and `http.ts` wrap every webhook and action in an `events` row plus `event_attempts`, so every integration gets the event log, retries and the inspector for free.

**Request lifecycle**
- **Inbound webhook:** read raw body → `verify` → insert `events` row (`direction=inbound`, unique on `(provider, external_id)`; a duplicate returns 200 without reprocessing) → respond 200 → fast-path processing via `waitUntil`. The pg_cron sweeper is the fallback.
- **Outbound action:** `enqueue(provider, action, input, idempotencyKey)` inserts a `pending` event. The worker claims it with `FOR UPDATE SKIP LOCKED`, runs it, and records the attempt.
  - On failure: exponential backoff with jitter (`next_attempt_at`), honoring `Retry-After` on 429.
  - After `max_attempts`, the event becomes `dead`.
- **Retry button:** resets the event to `pending` with `next_attempt_at = now()`.

---

## 2. Supabase schema

**Enums:** `member_role (owner, admin, member)`, `order_status (pending, paid, label_created, in_transit, out_for_delivery, delivered, exception, stuck, cancelled)`, `event_direction (inbound, outbound, internal)`, `event_status (pending, processing, succeeded, failed, dead, ignored)`, `connection_status (connected, error, revoked)`.

| Table | Key columns | Notes |
|---|---|---|
| `organizations` | id, name, slug, is_demo, created_at | One is created per new user by a trigger on `auth.users` |
| `memberships` | org_id, user_id, role, PK(org_id,user_id) | |
| `customers` | id, org_id, email, name, stripe_customer_id, hubspot_contact_id | unique(org_id, email) |
| `orders` | id, org_id, customer_id, status, amount_cents, currency, line_items jsonb, stripe_payment_intent_id **unique**, easypost_shipment_id, tracking_code, carrier, hubspot_deal_id, status_changed_at, source (`checkout`/`simulated`) | |
| `order_status_history` | id, order_id, from_status, to_status, event_id, created_at | Drives the order timeline |
| `events` | id, org_id (nullable until resolved), direction, provider, type, status, external_id, idempotency_key, order_id, parent_event_id, request jsonb (redacted), response jsonb, http_status, error, attempts, max_attempts, next_attempt_at, created_at, processed_at | unique(provider, external_id) for inbound, unique(provider, idempotency_key) for outbound. Also serves as the job queue. Index on (status, next_attempt_at) |
| `event_attempts` | id, event_id, attempt_no, started_at, duration_ms, http_status, error, response jsonb | Per-attempt history for the inspector |
| `connections` | id, org_id, provider, status, account_label, external_account_id, scopes text[], token_expires_at, metadata, connected_by, timestamps | unique(org_id, provider). **No secrets in this table** |
| `connection_secrets` | connection_id PK, vault_secret_id | RLS on, **no policies** (service role only) |
| `ai_outputs` | id, org_id, order_id, kind (summary/reply_draft), model, content, input_tokens, output_tokens, created_at | |
| `usage_counters` | key, window_start, count, PK(key, window_start) | Rate limits and AI caps (per IP, per org, global/day) |

**Functions** (all `security definer`, `set search_path = ''`):
- `private.is_org_member(org uuid)` and `private.has_org_role(org uuid, roles member_role[])` are used by every policy.
- `public.claim_events(batch)` serves the worker (and dead-letters rows abandoned on their last attempt); `public.bump_usage(key, window, limit)` does atomic rate limiting; `public.transition_order(order, status, event)` changes status + history atomically. All are service-role only.
- `public.set_connection_secret(conn, secret)` and `public.get_connection_secret(conn)` wrap `vault.create_secret`/`vault.decrypted_secrets`, executable by `service_role` only.
- `private.reset_demo_data()` resets the demo org.
- `private.mark_stuck_orders()` flags orders sitting in `label_created`/`in_transit` past a threshold and enqueues a Slack notification.

**RLS policies:**
- **Members can read, server writes:** all org-scoped tables (`customers, orders, order_status_history, events, event_attempts, connections, ai_outputs`) allow `select` when `is_org_member(org_id)`. They have **no insert/update/delete policies for `authenticated`**. Every write goes through server routes that check membership/role and then use the service client. This keeps the client strictly read-only and auditable.
- `organizations`: members can select; owner/admin can update.
- `memberships`: members can select their org's rows; owners can insert/update/delete. A user can always select their own rows.
- `connection_secrets`, `usage_counters`: RLS enabled, no policies.
- **Realtime:** `events` and `orders` are added to `supabase_realtime`, and RLS filters what each subscriber receives.

**pg_cron jobs** (the worker URL and `CRON_SECRET` live in Vault):
- `process-events` runs every minute: `net.http_post` → `/api/jobs/run`.
- `detect-stuck-orders` runs every 15 minutes: `mark_stuck_orders()`.
- `purge-usage-counters` runs daily at 03:15 UTC: deletes rate-limit windows older than 2 days.
- `reset-demo` runs nightly at 03:00 UTC: `reset_demo_data()` (wipes demo orders/events/ai_outputs and re-seeds a baseline).

**Demo mode:**
- **Seeded data:** `seed.sql` creates the demo org (`is_demo=true`) and a demo user.
- **Login:** `/api/demo/login` signs in server-side with credentials from env, so the password never ships to the client.
- **Restrictions:** demo members can't disconnect or reconnect integrations, invite members, or edit the org. Server routes enforce this by checking `is_demo`.
- **Limits:** Simulate order is limited to 5 per IP per hour and 100 per day globally. AI is limited to 10 calls per IP per day plus a global daily token cap.

**Simulate order:** the server creates and confirms a Stripe test PaymentIntent (`pm_card_visa`, metadata `org_id`, `source=simulated`). Stripe then sends a **real** signed webhook. Both real Checkout and Simulate converge on `payment_intent.succeeded`, which means one code path and one idempotency key.

---

## 3. Phased build plan
Each phase ends deployed to Vercel with CI green.

**Phase 0 — Scaffold + guardrails (small)**
- Set up Nuxt 4, Nuxt UI, `@nuxtjs/supabase`, ESLint (`@nuxt/eslint`), Vitest, Supabase CLI (`supabase init`), pgTAP (`supabase/tests/`), and type generation.
- Add the CI workflow, `.env.example`, `CLAUDE.md` and a README skeleton.
- Add the Claude Code guardrails from section 6 (hooks, subagents, skills) and the `scripts/` safety scripts **before any schema work**.
- Create the Vercel project and Supabase cloud project, then link them.
- Add a keep-alive so the free Supabase project never pauses (section 8).
- Prod migrations go out through a GitHub Action (`supabase db push`) that runs only on `main`, behind a GitHub "production" environment that needs the owner's manual approval. Nobody pushes to prod from a laptop.

**Phase 1 — Auth + schema + Stripe + event log, end to end**
1. Migrations for orgs/memberships plus helpers and RLS, the new-user trigger, then customers/orders/history, events/attempts, connections/secrets, and usage counters.
2. Auth: email/password and Google login via Supabase, with route middleware and org context (`useOrg`).
3. Core: `events.ts`, `worker.ts`, `http.ts`, `rate-limit.ts`, `/api/jobs/run`, plus pg_cron `process-events`.
4. Stripe module: Checkout endpoint, Simulate endpoint, and a webhook with signature verification, idempotent insert and the `payment_intent.succeeded` handler. The handler upserts the customer, creates the order and writes status history.
5. UI: dashboard with the live Realtime feed, orders list and detail, event inspector (payload viewer, attempts, retry button), and a Connections page showing Stripe as a platform integration.
6. Demo: seeded org and user, "Try demo", rate limits, nightly reset.
7. Tests: signature verification, idempotency (the same webhook twice gives one order), backoff math, RLS (user A can't read org B).

**Phase 2 — EasyPost**
- `order-flow` on `paid` enqueues `easypost.create_shipment` (test label).
- Tracker webhook with HMAC verification; status mapper from EasyPost status to `order_status`.
- `detect-stuck-orders` cron.
- Simulate uses EasyPost test tracking codes so the flow reaches delivered or exception.

**Phase 3 — Slack (first OAuth integration)**
- Generic OAuth plumbing: signed state, Vault storage, a reusable connect/disconnect UI.
- Slack app `chat:write` + channel picker. Notifications on shipped, delivered, exception and stuck, using Block Kit with a link back to the order.

**Phase 4 — HubSpot**
- OAuth with token refresh.
- On `paid`: upsert the contact by email and create a deal associated with it. On status changes: move the deal stage.
- Handle 429s and HubSpot's per-10-second limits through `http.ts`.

**Phase 5 — Google (Gmail + Calendar)**
- OAuth with `gmail.send` and `calendar.events` scopes, plus refresh.
- On `delivered`: send a follow-up email. "Book a call" creates a Calendar event with a Meet link.
- Demo: recipients are restricted to `DEMO_EMAIL_ALLOWLIST`. The app stays in Google "testing" mode, which means listed test users only, and the README says so.

**Phase 6 — Claude**
- "Summarize order" builds a prompt from the order, its history and its events. "Draft reply" takes the customer's message and the order context.
- Model set via `ANTHROPIC_MODEL` (default: a Haiku-class model to keep costs down). Outputs are stored in `ai_outputs`.
- Per-IP and global token caps, with every call logged as an outbound event.

**Phase 7 — Polish**
- Discord module (webhook URL connection), added to prove the interface takes about one file of work.
- README with an architecture diagram, an annotated walkthrough of a flow and a "how to add an integration" guide.
- Playwright smoke test of Simulate → delivered.
- Error monitoring (optional Sentry).

---

## 4. Accounts & keys, in the order you need them
| # | Account | What to create | Env vars | Phase |
|---|---|---|---|---|
| 1 | GitHub (sanchaichie) | `sanchaichie/opshub` repo | — | 0 |
| 2 | Supabase | Project (note: free tier pauses after 7 idle days) | `SUPABASE_URL`, `SUPABASE_KEY` (anon/publishable), `SUPABASE_SERVICE_KEY` | 0 |
| 3 | Vercel | Project linked to the repo | — | 0 |
| 4 | Google Cloud | Project + OAuth consent screen + OAuth client **for Supabase login**; set its ID/secret in the Supabase dashboard | (in Supabase) | 1 |
| 5 | Resend (or other SMTP) | Custom SMTP for Supabase auth emails (the built-in SMTP is heavily rate-limited) | (in Supabase) | 1 |
| 6 | Stripe | Account (test mode) + Stripe CLI for local webhooks; webhook endpoint for prod | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | 1 |
| 7 | — | App secrets you generate yourself | `CRON_SECRET`, `NUXT_PUBLIC_SITE_URL` | 1 |
| 8 | EasyPost | Account → test API key + webhook (with HMAC secret) | `EASYPOST_API_KEY`, `EASYPOST_WEBHOOK_SECRET` | 2 |
| 9 | Slack | Personal dev workspace + Slack app (OAuth, `chat:write`, redirect URL) | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | 3 |
| 10 | HubSpot | Developer account + test portal + app (OAuth, CRM contacts/deals scopes) | `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` | 4 |
| 11 | Google Cloud (same project) | Enable Gmail + Calendar APIs; **second** OAuth client for integrations; add yourself as test user | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DEMO_EMAIL_ALLOWLIST` | 5 |
| 12 | Anthropic Console | API key + monthly spend limit | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_DAILY_TOKEN_CAP` | 6 |
| 13 | Discord | Server + channel webhook (stored per connection, no env var) | — | 7 |

---

## 5. CLAUDE.md
CLAUDE.md (repo root) covers:
- **Commands:** dev, lint, typecheck, test, `supabase start/db reset/gen types`, `stripe listen`.
- **Secrets:** server-only. Never import the service client or a secret in `app/`. Use `useRuntimeConfig()` for keys, never `process.env` in feature code.
- **Data access:** the client only reads through RLS, and every write goes through a server route that calls `requireOrgRole`. All tables are org-scoped.
- **Migrations:** schema changes are new timestamped files in `supabase/migrations`; never edit an applied migration. Regenerate types after each change.
- **Webhooks:** verify, store, ack, process. No side effects before the raw event is stored.
- **Outbound calls:** every external call goes through `enqueue` and `http.ts`, with a deterministic idempotency key.
- **New integrations:** implement `Integration` in `server/integrations/<id>/`, register it in `registry.ts`, add env vars to `.env.example` and add tests.
- **Code style:** TypeScript strict, no `any`, small functions, Zod validation at every route boundary, comments that say *why*, not *what*.
- **Git:** commits as sanchaichie, conventional commit messages.

---

## 6. Claude Code guardrails (hooks, subagents, skills)
Goal: make the dangerous things impossible, or at least gated behind your approval, and make the right things the default path. Hooks are small Node scripts (`.claude/hooks/*.mjs`, no deps) wired up in the committed `.claude/settings.json`.

### Database-reset safety (defense in depth)
1. **Only one reset path:** `pnpm db:reset` runs `scripts/db-reset-local.sh`.
   - It asserts the target is local: `supabase status` reports a running stack and the DB URL is `127.0.0.1:54322`. Otherwise it aborts.
   - It then runs `supabase db reset` (local), pgTAP tests and type generation.
   - There is **no** script for resetting a remote database.
2. **Claude Code permission rules** (`.claude/settings.json`):
   - `deny`: `supabase db reset --linked*`, `supabase db reset --db-url*`, `supabase projects delete*`, `Read(./.env)`, `Read(./.env.local)`, `Read(./.env.production)`.
   - `ask`: `supabase db push*`, `supabase migration repair*`, `supabase link*`, `vercel --prod*`, `git push*`.
3. **Bash guard hook** catches what prefix rules miss: chained commands, `npx`/`pnpm dlx` wrappers, inline psql.
4. **Demo reset in prod is a SQL function, not a reset.**
   - `private.reset_demo_data()` only deletes rows whose org has `is_demo = true`, and raises an exception if it would touch any other org.
   - It runs inside one transaction and can only be executed by `postgres`/pg_cron, never `authenticated`.
   - pgTAP tests prove that a non-demo org's rows survive it.
5. **Prod migrations only via CI with manual approval** (Phase 0). Before that step, `supabase db diff --linked` runs read-only to catch drift.

### Hooks
| Event | Script | Behavior |
|---|---|---|
| PreToolUse `Bash` | `guard-bash.mjs` | Splits chained commands (`&&`, `;`, `\|`, `$( )`) and checks each part. **Blocks:** remote `db reset`, `DROP DATABASE/SCHEMA`, `TRUNCATE`/unscoped `DELETE` via `psql` to non-localhost, `rm -rf` outside the repo, `git push --force` to `main`, printing `.env*` (`cat/grep/env/printenv` of secrets). **Asks:** `db push`, `migration repair`, prod deploys. A local `supabase db reset` is redirected to `pnpm db:reset`. |
| PreToolUse `Read\|Edit\|Write` | `guard-files.mjs` | Blocks reading/writing `.env*` except `.env.example`. Blocks editing a migration that is already committed to git (create a new one instead). Blocks writing content that matches secret patterns (`sk_live_`, `sk_test_`, `whsec_`, `xox[bp]-`, `pat-`, JWT service keys, `sk-ant-`). Blocks server-only imports (service client, `runtimeConfig` secrets) in files under `app/`. |
| PostToolUse `Edit\|Write` | `post-edit.mjs` | Runs `eslint --fix` on the changed file and feeds errors back. When a file in `supabase/migrations` changes, reminds Claude to run `pnpm db:reset` and the migration-reviewer. |
| Stop | `verify-on-stop.mjs` | Runs only if the working tree has changes (and skips when `stop_hook_active`, so it can't loop). Runs `pnpm typecheck` and `pnpm test --run`. On failure it blocks the stop and feeds the output back, so Claude doesn't end a turn with a broken build. |
| SessionStart | `session-context.mjs` | Prints the branch, git status, whether the local Supabase stack is up, and the linked project ref, so Claude always knows which DB is local and which is remote. |

Every hook has a Vitest unit test (`tests/hooks/`) that feeds it sample tool-input JSON: dangerous commands must block, normal ones must pass.

### Subagents (`.claude/agents/`)
| Agent | Tools | Purpose |
|---|---|---|
| `migration-reviewer` | read-only + `supabase test db` | Reviews new migrations. Checks: RLS enabled on every table, policies use the `private.*` helpers, `security definer` functions set `search_path = ''`, grants are minimal, FK indexes exist, no destructive statements without an explicit comment, Realtime publication is correct, pgTAP coverage exists. |
| `security-reviewer` | read-only | Reviews a diff for secrets reaching the client bundle, server routes missing `requireOrgRole`/Zod validation, webhooks with side effects before verify+store, tokens returned in responses, demo-mode restrictions bypassed, and redaction missing in event payloads. |
| `integration-test-writer` | read + edit (`tests/`, `supabase/tests/` only) | Writes Vitest tests for an integration (signature verify, idempotency, mappers, 429/backoff) and pgTAP tests for RLS and reset functions. |

### Skills (`.claude/skills/`)
| Skill | What it does |
|---|---|
| `new-migration` | `supabase migration new` → fill in the template (table + RLS + policies + grants) → `pnpm db:reset` → pgTAP → regenerate types → run `migration-reviewer`. |
| `db-reset` | The only documented way to reset: checks the local stack, runs `pnpm db:reset`, re-seeds, regenerates types. States explicitly that remote databases are never reset, and that demo data in prod is reset only via `reset_demo_data()`. |
| `add-integration` | Scaffolds `server/integrations/<id>/` from a template implementing `Integration`, registers it, adds env vars to `.env.example`, adds the Connections-page entry, and calls `integration-test-writer`. |
| `webhook-test` | Per-provider recipes for firing real test webhooks locally (`stripe listen/trigger`, EasyPost test trackers, a curl with a bad signature), then checks the event log and idempotency. |
| `phase-start` / `task-done` | Project tracking workflow (see section 7). |
| `pre-deploy` | Runs lint, typecheck, unit tests, pgTAP, `security-reviewer`, `migration-reviewer` on pending migrations, and a read-only `supabase db diff --linked`, then prints a go/no-go checklist. |

---

## 7. Project tracking (plan → phase → task, one file each)
This doubles as a client-facing showcase of how the project was planned and built with Claude Code. It's linked from the README section "How this was built".

**Files**
- **`docs/plan/README.md`, the index.** A table of phases (status badge, dates, link) plus the task currently in progress.
- **`docs/plan/00-architecture.md`, the plan.** The approved version of this document, kept current. Any change gets a dated entry in its changelog.
- **`docs/plan/phases/phase-N-<slug>.md`, one per phase (0–7).** Each contains:
  - Frontmatter: `status: planned | in-progress | done`, `started`, `completed`.
  - Goal, scope and out-of-scope.
  - A task list linking to the task files.
  - Exit criteria (the verification steps).
  - A retrospective: what changed versus the plan, and what was learned.
- **`docs/plan/tasks/phase-N/NN-<slug>.md`, one per task.** Each contains:
  - Frontmatter: `status`, `phase`, `started`, `completed`, `commits`.
  - Goal, acceptance criteria, files touched.
  - **"How Claude was used"**: which skills, subagents and hooks were involved, and what a reviewer agent caught.
  - Outcome and follow-ups.
- **`docs/decisions/NNNN-<slug>.md`, short ADRs** for the key calls already made:
  - Nuxt server routes over Edge Functions
  - real sandbox calls in demo mode
  - platform vs connected integrations
  - one `events` table as both the log and the job queue
  - `payment_intent.succeeded` as the single order trigger

All phase files are created in Phase 0. Task files for a phase are created when that phase starts, so there are no stale stubs.

**Workflow, kept honest by tooling**
- **`phase-start` skill:** marks the phase `in-progress`, breaks it into task files from its scope, and updates the index.
- **`task-done` skill:**
  - Checks the acceptance criteria and runs the verification.
  - Fills in "How Claude was used" and the commit hashes.
  - Sets `status: done` and updates the phase and index tables.
  - Commits as `docs(plan): complete P<N>-<NN> <slug>`.
- **SessionStart hook** (`session-context.mjs`) also prints the current phase and in-progress task from the index, so every session starts on the right task.
- **Commit convention:** feature commits reference their task ID, e.g. `feat(stripe): verify webhook signatures [P1-04]`, which keeps the git log traceable back to task files.

---

## 8. Supabase keep-alive (the free tier pauses after 7 days of inactivity)
Pausing is driven by external API activity. pg_cron jobs running inside the database probably don't count, so we don't rely on them. Instead, two **independent** external pingers each make a real read and write:

1. **The work both pingers trigger.**
   - A `system_heartbeats(source text PK, last_seen timestamptz, details jsonb)` table with RLS on and no policies.
   - An RPC `private.heartbeat(source text)` that upserts that row. It's executable by `service_role` only, and `authenticated` users can't call it.
2. **Vercel Cron, daily.** `vercel.json` cron (Hobby allows daily) → `GET /api/health`, protected by the bearer `CRON_SECRET` that Vercel sends automatically.
   - The route calls `heartbeat('vercel-cron')` and returns `{ db: 'ok', lastSeen }`.
   - The same endpoint doubles as the uptime/health check.
3. **GitHub Actions, every 2 days, so it doesn't depend on Vercel.** `.github/workflows/keepalive.yml` calls the Supabase REST RPC directly with the service key from GitHub secrets: `heartbeat('github-actions')`.
   - A failed run emails the repo owner.
   - It also has `workflow_dispatch` so it can be run by hand.
   - GitHub disables scheduled workflows after 60 days without repo activity. The workflow keeps itself enabled by calling `gh workflow enable` on itself, and the README notes this.
4. **Visibility.** The dashboard footer shows "DB heartbeat: last seen …" for both sources, read through `/api/health`.
   - The `pre-deploy` skill warns if either heartbeat is older than 3 days.

Honest caveats, for the README:
- This is a portfolio workaround. Supabase can change its inactivity rules.
- The permanent fix is the Pro plan.
- If a pause happens anyway, the project can be restored from the dashboard. Migrations + seed in the repo mean nothing is lost except demo data, which is reset nightly anyway.

Extra env/secrets: GitHub repo secrets `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. `CRON_SECRET` is shared with the pg_cron worker.

---

## Verification (Phase 0 guardrails)
- `curl -H "Authorization: Bearer $CRON_SECRET" <prod>/api/health` returns `db: ok` and updates `system_heartbeats`. Without the header it returns 401.
- Manually dispatching `keepalive.yml` succeeds, and the `github-actions` heartbeat timestamp updates.
- Hook unit tests pass: `supabase db reset --linked`, `echo x && supabase db reset --db-url ...`, `cat .env`, and editing a committed migration are all blocked. `pnpm db:reset`, `pnpm test`, and reading `.env.example` all pass.
- `pnpm db:reset` aborts when the local stack is stopped or `SUPABASE_DB_URL` points to a remote host.
- pgTAP: `reset_demo_data()` leaves a non-demo org's rows untouched, and `authenticated` cannot execute it.

## Verification (Phase 1 "done")
1. `supabase db reset` applies the migrations and seed cleanly. RLS tests pass: a user in org A gets 0 rows from org B.
2. With `pnpm dev` + `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, clicking Simulate order makes an order appear in the live feed without a refresh, and the event inspector shows the inbound event as `succeeded`.
3. `stripe events resend <id>` creates no duplicate order; the event shows as already processed.
4. A tampered signature (curl with a bad header) returns 400 and creates no row.
5. Forcing a handler error leaves the event `failed` with `next_attempt_at` set. Pressing Retry after fixing it moves the event to `succeeded`, with both attempts recorded.
6. On the Vercel deploy, Try demo signs in and Simulate works against prod. The rate limit triggers on the sixth simulate. Running `select private.reset_demo_data()` restores the baseline.

---

## Changelog
Changes made to this plan after approval. Each entry is dated and explains why.

- **2026-11-08: Phase 0 implementation notes**
  - **Env var names** follow Nuxt's runtime-config convention: `NUXT_*` for server secrets and `NUXT_PUBLIC_*` for browser values (e.g. `NUXT_SUPABASE_SECRET_KEY`, `NUXT_STRIPE_SECRET_KEY`). `CRON_SECRET` keeps its plain name because Vercel Cron sends it as-is. `.env.example` is the source of truth.
  - **Supabase keys** use the new publishable/secret key pair (`NUXT_PUBLIC_SUPABASE_KEY`, `NUXT_SUPABASE_SECRET_KEY`) instead of the legacy anon/service_role JWTs.
  - **Heartbeat RPC** is `public.heartbeat(pinger text)`, not `private.heartbeat`, because PostgREST only exposes `public`. Execution is revoked from `anon`/`authenticated` and granted to `service_role` only. The table itself lives in `private`. A read-only `public.heartbeat_status()` backs the unauthenticated `/api/health` response.
  - **Local Supabase ports** moved to 563xx (API 56321, DB 56322, Studio 56323), because other local projects already use 543xx and 553xx.
  - **TypeScript is pinned to 5.9.** TS 7 isn't supported by typescript-eslint or vue-tsc yet.
  - **h3 is pinned to v1** as a direct dependency. `@nuxt/test-utils` pulled in h3 v2, which broke `@nuxtjs/supabase` cookie handling (`event.req.headers.get is not a function`). test-utils is deferred to Phase 7 (Playwright).
- **2026-11-09: Phase 1 schema**
  - **No browser writes at all.** §2 said owners/admins could update orgs and manage memberships directly. In practice *every* table is read-only for `authenticated`, and org or member changes go through server routes like everything else. This puts all authorization and demo-mode restrictions in one layer (`requireOrgRole`), and pgTAP proves the browser can't, for example, flip `is_demo`.
  - **Internal tables in `private`:** `connection_secrets` and `usage_counters` live in the `private` schema (not exposed by the Data API) rather than `public`.
  - **Service functions are in `public`** (`claim_events`, `bump_usage`, `transition_order`, `set/get_connection_secret`) so the server can call them over PostgREST. Execution is revoked from everyone but `service_role`.
  - **`transition_order()`** updates an order's status and writes its history row atomically, so the timeline can't drift from the order.
  - **Deleting a connection also deletes its Vault secret** (trigger), so revoked credentials don't linger encrypted at rest.
  - **Lesson recorded in the `new-migration` skill:** Postgres grants EXECUTE to PUBLIC on every new function, and a schema-level `alter default privileges ... revoke` can't undo that. Every function revokes it explicitly. pgTAP caught this in P1-01.
- **2026-11-09: pg_net and the worker secret (accepted risk).** The pg_cron worker call sends `CRON_SECRET` as a header, and pg_net keeps it in `net.http_request_queue` until the request is sent. Supabase grants that table to PUBLIC (granted by `supabase_admin`, so a migration can't revoke it). Browser roles can't reach it, because the Data API exposes only `public`/`graphql_public`, and a pgTAP test ensures nothing in `public` leads to `net`. The secret can only make the worker run early. Found by migration-reviewer while reviewing P1-04.
- **2026-11-09: Phase 1 demo mode and tenant integrity**
  - **Org-scoped foreign keys.** Every reference between org-scoped rows is a composite foreign key, `(org_id, x_id) → (org_id, id)`. A row can't point at another org's row, so no cascade or SET NULL crosses tenants. Found by migration-reviewer: with single-column keys, one bug elsewhere plus the nightly demo reset could have deleted or nulled a real org's rows.
  - **`organizations.is_demo` is immutable** (trigger), so no bug can turn a real org into one the nightly reset wipes.
  - **One throwaway account per demo visitor** instead of one shared demo account ([ADR 0007](../decisions/0007-per-visitor-demo-accounts.md)). Found by security-reviewer: with a shared account, any visitor's sign-out would log out everyone. There is no demo password env var anymore.
  - **Simulate limits:** the shared daily budget applies to the demo org only. Real orgs get their own per-org limit.
- **2026-11-09: Phase 2 shipping**
  - **Order columns:** `shipping_address` (validated jsonb), `label_url`, `easypost_tracker_id`.
  - **Tracker webhooks match on unique ids only** (tracker id, or shipment id), never on tracking code. Found by security-reviewer: EasyPost's test tracking codes are shared across orders and orgs.
  - **Optional `resolveOrgId` hook:** added to the `Integration` interface for providers whose payloads carry no org id.
  - **Stuck detection:** `private.mark_stuck_orders()` runs every 5 minutes and enqueues internal `opshub`/`order.stuck` events, handled in TypeScript.
  - **Worker fast path:** chains up to 5 batches (15s) after a webhook or user action.
  - **Personal data in Realtime:** `orders` (published to Realtime) now carries `shipping_address`. RLS limits it to org members, and demo orders only hold generated addresses.
- **2026-11-10: Phase 3 OAuth and Slack**
  - **Generic OAuth flow:** `/api/oauth/[provider]/start|callback` plus `DELETE /api/connections/[provider]`, driven by an `OAuthConfig` on each `Integration`.
  - **OAuth state:** a random token stored hashed in `private.oauth_states` (single use, 10 minutes) and bound to the browser by an httpOnly cookie. No HMAC secret.
  - **Slack:** uses the `incoming-webhook` scope and stores only the webhook URL in Vault. Notifications go out from `onOrderStatusChanged` for in_transit, delivered, exception and stuck.
- **2026-11-11: Phase 4 HubSpot**
  - **Token refresh** lives in `server/lib/connections.ts`: `getFreshConnection` and `withAuthRetry`, with compare-and-set saves.
  - **HubSpot deal stages** record the sale; fulfilment goes in a custom `opshub_status` property.
  - **Idempotent sync:** a unique `opshub_order_id` deal property makes every sync an idempotent upsert.
