---
id: P1-05
title: "Stripe: webhook, Checkout, Simulate order"
phase: 1
status: done
started: 2026-11-09
completed: 2026-11-09
commits: []
---

# P1-05 — Stripe: webhook, Checkout, Simulate order

## Goal
A Stripe test payment, from real Checkout or **Simulate order**, arrives as a signed webhook and becomes exactly one order with its customer and status history.

## Acceptance criteria
- [x] `server/integrations/stripe/`: verify (raw body), identify, handle `payment_intent.succeeded`
- [x] `POST /api/webhooks/stripe`: verify → store → 200 → process (`waitUntil`)
- [x] `POST /api/checkout` (Checkout session, metadata `org_id`, `source=checkout`)
- [x] `POST /api/orders/simulate` (confirm a test PaymentIntent with `pm_card_visa`, rate-limited)
- [x] Handler upserts the customer, creates the order (`paid`), writes status history
- [x] Unit tests: bad signature → 400 + no row; duplicate webhook → one order; mapper
- [x] security-reviewer: FAIL → all 5 findings fixed (see below)
- [ ] End to end with `stripe listen` (needs a Stripe test key in `.env`; **pending keys**, see Outcome)

## Files touched
- `server/integrations/stripe/*`, `server/api/webhooks/[provider].post.ts` (one generic route for every provider)
- `server/api/checkout.post.ts`, `server/api/orders/simulate.post.ts`, `server/flows/order-flow.ts`

## How Claude was used
- **Design choice: no Stripe SDK.**
  - Claude implemented signature verification from Stripe's spec (`signature.ts`: HMAC-SHA256 over the raw body, constant-time compare, 5-minute replay window), plus a small REST client on top of the shared `http.ts`.
  - Every Stripe call therefore gets the same timeouts, retry rules and idempotency keys as other providers. Live keys are refused before any request is made.
  - It also meant the whole webhook path could be **tested end to end without a Stripe account**, by signing Stripe-shaped payloads with a locally generated secret.
- **One generic webhook route** (`/api/webhooks/[provider]`) serves every provider.
- **Live checks against the local stack:**
  - **Webhooks:**
    - A genuine webhook creates one order, with its customer, line items and status history.
    - The same event replayed, or a *different* event for the same payment, creates no duplicate.
    - A bad signature returns 400 and stores nothing.
    - Unused event types are marked `ignored`.
    - `client_secret` is redacted in storage.
  - **Signed-in routes** (using a real session cookie):
    - Simulate returns 401 when signed out and 403 for another org.
    - Without a Stripe key, the queued job is dead-lettered with a clear message, and Retry re-runs it with the attempt history kept.
    - The per-IP limit returns 429 with `Retry-After` on the 6th call.
    - Checkout fails cleanly (502) and is still logged.
- **security-reviewer: FAIL, with one medium-severity finding Claude hadn't considered.** In the *public demo*, anyone trying Checkout would have published their real email and name to every visitor, because demo customers are visible to all. If the endpoint were subscribed to `charge.*`, their address and card details would have been stored too. Fixes:
  - Demo Checkout pre-fills a generated `@example.com` customer, and Stripe then locks the email field.
  - Event types OpsHub doesn't use are stored as id + type only, never their payload.
  - The extra charge lookup logs only the charge id.
  - Unit tests lock both protections in.
- **Low-severity findings, all fixed:**
  - Live-mode events are now rejected.
  - Retry authenticates before reading, so signed-out callers can't probe which event ids exist.
  - A database error during org lookup now returns 500, so Stripe redelivers instead of the order being silently lost.
  - A code comment claimed the charge lookup was logged when it wasn't. It's now actually logged.
- **Architecture fix found by the tests.** Logging the charge lookup made integration code import Nuxt glue, which broke the unit tests. `recordSyncCall` moved into the framework-free `server/lib/`.
- **A test-script bug, honestly reported.** One of Claude's own e2e checks ("retry a non-failed event") was badly written and proved nothing, so it's not counted. The 409 guard on Retry is in the code but hasn't been exercised yet.

## Outcome
Stripe orders work end to end locally through signed webhooks:
- One payment always gives exactly one order.
- Simulate and Checkout share one code path.
- Every call appears in the event log.
- Demo visitors' personal data is never published.

**Pending keys:** the live Stripe round-trip (Simulate → real PaymentIntent → real webhook, and a real Checkout) runs as soon as `NUXT_STRIPE_SECRET_KEY` and `NUXT_STRIPE_WEBHOOK_SECRET` are in `.env`.

## Follow-ups
- Live Stripe run with `stripe listen` → when keys exist (P0-07)
- Exercise the 409 guard on Retry → P1-06 UI test
