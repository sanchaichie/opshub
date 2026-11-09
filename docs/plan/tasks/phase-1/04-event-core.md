---
id: P1-04
title: "Event core: log, queue, worker, retries"
phase: 1
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P1-04 — Event core: log, queue, worker, retries

## Goal
The reliability engine every integration uses: recording inbound/outbound events, a queue with exponential backoff and `Retry-After` support, a redacting HTTP wrapper, rate limits, and the worker endpoint pg_cron calls.

## Acceptance criteria
- [x] `Integration` interface + registry (`server/integrations/types.ts`, `registry.ts`)
- [x] `server/utils/events.ts`: `recordInbound`, `enqueue`, `completeEvent`, `failEvent` (backoff + jitter, `dead` after max attempts)
- [x] `server/utils/http.ts`: timeout, 429/`Retry-After`, redaction of auth headers and tokens
- [x] `server/utils/worker.ts` + `POST /api/jobs/run` (`isCronRequest`)
- [x] `POST /api/events/:id/retry` (members only); typechecked, live click-through in P1-06 once login exists
- [x] `server/utils/rate-limit.ts` over `bump_usage`
- [x] pg_cron `process-events` every minute via pg_net (URL + secret from Vault)
- [x] Unit tests: backoff math, Retry-After, redaction, failure → dead

## Files touched
- `server/integrations/{types,registry}.ts`, `server/lib/{errors,backoff,redact,http,worker}.ts` (framework-free, unit-tested), `server/utils/{events,worker,auth,rate-limit}.ts` (Nuxt/Supabase glue)
- `server/api/jobs/run.post.ts`, `server/api/events/[id]/retry.post.ts`
- `supabase/migrations/*_cron_jobs.sql`

## How Claude was used
- **Design: a framework-free core.**
  - Claude split the engine into a framework-free core (`server/lib/`) and thin Nuxt/Supabase glue (`server/utils/`).
  - The worker's retry rules depend on a 4-method `EventRepo` interface instead of Supabase, so they're unit-tested without a database (46 new unit tests across backoff, redaction, the HTTP wrapper and the worker).
- **Unit tests caught a parser bug.** `parseRetryAfter("-5")` returned 0 ("retry immediately") because `Date.parse` reads `-5` as the year −5. The parser now accepts only the real HTTP-date shape.
- **migration-reviewer on the cron migration: APPROVE WITH NITS.** All applied:
  - assert the bearer header in the queued request
  - an index for the purge query
  - align pg_net's timeout with Vercel's `maxDuration` (now 60s, with the worker's time budget below it)
  - correct the docs
  - test that browser roles can't read pg_net's request queue
- **That last test failed, and it found a real platform behavior.** Supabase grants pg_net's tables to PUBLIC as `supabase_admin`, so a migration can't revoke them. Claude verified this, rather than assuming the revoke worked. The bearer secret briefly sits in that queue. It's recorded as an **accepted risk** with a reason (the Data API doesn't expose `net`, and a leaked secret can only make the worker run early). The test now enforces what we *can* control: nothing in `public` leads to `net`.
- **Live check (no provider keys needed):**
  - `/api/jobs/run` returns 401 without the secret.
  - With it, an event for an unregistered provider was claimed, dead-lettered with a clear error, and its attempt recorded.
- **Ordering:** `server/utils/auth.ts` (`requireUserId`, `requireOrgRole`, `forbidInDemo`) was written here, ahead of P1-03, because the Retry endpoint needed it.

## Outcome
The reliability engine is in place:
- **Recording:** idempotent recording of inbound and outbound events, with redaction applied centrally.
- **Retries:** exponential backoff with jitter, `Retry-After` support, and dead-lettering.
- **Fast path:** a webhook gets its 200 immediately and its event is processed right after.
- **Sweep:** pg_cron runs the worker every minute (once configured with `scripts/configure-worker.sh`).
- **Limits:** rate limits that hold across serverless instances.

## Follow-ups
- Live test of the Retry button → P1-06
- Configure the production worker URL and secret in Vault → P0-07
