# ADR 0004: One events table is both the audit log and the job queue

- **Status:** Accepted
- **Date:** 2026-11-08

## Context
The app needs a webhook inspector (every inbound and outbound call, with payloads, attempts and retry) *and* a reliable retry queue. Keeping them separate risks the log and the real state drifting apart.

## Decision
Every inbound webhook and outbound action is a row in `events`, with per-attempt history in `event_attempts`. Outbound rows *are* the jobs: the worker claims `pending` rows with `FOR UPDATE SKIP LOCKED`, retries with exponential backoff and jitter (honoring `Retry-After`), and marks rows `dead` after `max_attempts`. The Retry button just resets a row to `pending`.

## Consequences
- What the inspector shows is exactly what the worker does, with no second source of truth.
- Idempotency is enforced by unique constraints: `(provider, external_id)` for inbound and `(provider, idempotency_key)` for outbound.
- High volume would eventually call for a dedicated queue, but that's not a concern at portfolio scale.
