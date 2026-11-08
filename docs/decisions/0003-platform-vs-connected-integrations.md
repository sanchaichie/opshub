# ADR 0003: Two kinds of integrations, platform and connected

- **Status:** Accepted
- **Date:** 2026-11-08

## Context
Some providers act on the app's own account (payments, labels, AI). Others act on the customer's own tools (CRM, chat, email). Treating them the same would mean either asking every org for a Stripe account, or storing everyone's CRM through one shared login.

## Decision
- **Platform** (Stripe, EasyPost, Claude): the app's API keys come from env. Inbound webhooks carry `org_id` in metadata to route them.
- **Connected** (Slack, HubSpot, Google, Discord): each org connects through OAuth (or a webhook URL). Tokens are stored in Supabase Vault, referenced from `private` tables, and never sent to the browser.
- Both implement the same `Integration` interface.

## Consequences
- Adding a provider means implementing one interface. Its kind decides only how credentials are found.
- Stripe Connect is deliberately out of scope.
