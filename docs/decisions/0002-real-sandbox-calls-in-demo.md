# ADR 0002: Demo mode makes real sandbox API calls

- **Status:** Accepted
- **Date:** 2026-11-08

## Context
The public demo must convince clients that the integrations are real. Mocked providers are safer but prove nothing.

## Decision
The demo org is pre-connected to the owner's own test/sandbox accounts (Stripe test mode, EasyPost test, a HubSpot test portal, a dev Slack workspace). **Simulate order** triggers genuine API round-trips and signed webhooks.

## Consequences
- The event log shows real provider responses, latencies and retries.
- Abuse has to be contained: per-IP and global rate limits, AI token caps, an email allowlist, a nightly demo reset, and demo users can't change connections.
- Sandbox outages show up in the demo, which is honest.
