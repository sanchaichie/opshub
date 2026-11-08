# ADR 0005: payment_intent.succeeded is the single order trigger

- **Status:** Accepted
- **Date:** 2026-11-08

## Context
Orders come from real Stripe Checkout, and from **Simulate order**, which can't drive a hosted Checkout page server-side. Handling `checkout.session.completed` for one and something else for the other would mean two code paths.

## Decision
Both paths converge on `payment_intent.succeeded`. Checkout sets `payment_intent_data.metadata` (`org_id`, `source=checkout`). Simulate creates and confirms a test PaymentIntent with `pm_card_visa` and `source=simulated`. Orders are unique on `stripe_payment_intent_id`.

## Consequences
- One handler and one idempotency key, and Simulate exercises the exact production path, including real webhook signatures.
- Customer details for Checkout orders come from the expanded customer/charge, not the session object.
