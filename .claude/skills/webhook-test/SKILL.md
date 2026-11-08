---
name: webhook-test
description: Fire real sandbox webhooks at the local OpsHub dev server (Stripe CLI, EasyPost test trackers, tampered signatures) and verify signature checks, idempotency and the event log. Use after changing any webhook handler or integration flow.
---

# Test webhooks locally

Prerequisites:
- `pnpm db:start`
- `pnpm dev` on :3000
- `.env` filled in by the user. Never read or print it.

## Stripe (test mode only, never `--live`)
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
`stripe listen` prints a `whsec_...` signing secret. The user puts it in `.env` as `NUXT_STRIPE_WEBHOOK_SECRET`. Don't copy it into any file yourself.

1. **Happy path:** click **Simulate order** in the UI, or:
   ```bash
   stripe trigger payment_intent.succeeded --add payment_intent:metadata.org_id=<demo org id>
   ```
   Expect: one order, one inbound event `succeeded`, and the live feed updates without a refresh.
2. **Idempotency:** `stripe events resend <evt_id>`. Expect no second order, and the event shows as a duplicate.
3. **Bad signature:**
   ```bash
   curl -i -X POST localhost:3000/api/webhooks/stripe \
     -H 'stripe-signature: t=1,v1=deadbeef' -d '{}'
   ```
   Expect 400 and **no** row in `events`.

## EasyPost (test mode)
Create a shipment with a test tracking code to drive status webhooks. The `EZ1000000001`…`EZ7000000007` codes each walk a different path (pre_transit → … → delivered, return_to_sender, failure, and so on). Expect the order status history to follow, and `stuck`/`exception` to enqueue a Slack notification.

## Check the results (read-only SQL)
Use Studio (http://127.0.0.1:56323) or the local DB:
```sql
select provider, type, status, attempts, error, created_at
from public.events order by created_at desc limit 20;
```

## Report
For each case, give the expected vs actual result, plus any event left `failed` or `dead` with its error.
