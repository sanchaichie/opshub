---
name: add-integration
description: Add a new third-party integration module to OpsHub (e.g. EasyPost, Slack, HubSpot, Google, Discord) using the shared Integration interface. Use when starting any new provider.
---

# Add an integration

Every provider is one folder implementing the shared `Integration` interface (`server/integrations/types.ts`). Logging, retries, idempotency and the event inspector come from the core. A module never logs or retries on its own.

## 1. Decide its kind
- **platform**: the app's own API key from env (Stripe, EasyPost, Claude). Inbound webhooks carry `org_id` in metadata.
- **connected**: each org connects its own account through OAuth (Slack, HubSpot, Google), or with a pasted webhook URL (Discord). Tokens go to Vault through `server/utils/secrets.ts`.

## 2. Scaffold
```
server/integrations/<id>/
  index.ts     # exports the Integration object; registered in ../registry.ts
  webhook.ts   # verify(raw) + identify(verified) + handle(storedEvent)   (if inbound)
  actions.ts   # outbound actions, each (ctx, input) => ActionResult
  mappers.ts   # provider payload <-> domain types (pure, unit-tested)
  schemas.ts   # Zod schemas for every provider payload we read
```
Rules:
- **Webhooks:** `verify` works on the **raw body** and checks the signature and timestamp tolerance. It throws `createError({ statusCode: 400 })` on failure. `handle` runs later in the worker, never in the request.
- **Outbound calls:** every external call goes through `http.ts` (timeouts, `Retry-After`, redaction, attempt logging), with a deterministic idempotency key such as `` `${provider}.${action}:${orderId}` ``.
- **Validation:** parse every provider payload with Zod. Unknown statuses map to a safe default and are logged.
- **Credentials:** no `process.env` anywhere. Use `useRuntimeConfig(event)`.

## 3. Wire it up
1. Register the module in `server/integrations/registry.ts`.
2. Add a webhook route `server/api/webhooks/<id>.post.ts`. It's thin: `readRawBody` → `verify` → `recordInbound` → 200 → `waitUntil(process)`.
3. Hook into `server/flows/order-flow.ts` for the domain events it reacts to.
4. Add env vars to `.env.example` (empty values, `NUXT_` prefix) and to `runtimeConfig` in `nuxt.config.ts`.
5. Add a card for it on the Connections page.
6. Update `docs/plan/00-architecture.md` and the current task file.

## 4. Test and review
1. Ask **integration-test-writer** for tests: signature, idempotency, mappers, retry/429, redaction.
2. Use the **webhook-test** skill to fire a real sandbox webhook locally and check the event log.
3. Ask **security-reviewer** to review the diff before committing.
