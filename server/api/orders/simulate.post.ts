import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { randomOrder } from '../../integrations/stripe/catalog'

const body = z.object({ orgId: z.uuid() })

/**
 * "Simulate order": queues a real Stripe test payment for a random cart. The
 * response returns as soon as the job is queued; the order then appears in
 * the live feed once Stripe's webhook comes back (usually 1–3 seconds).
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await readValidatedBody(event, body.parse)
  const membership = await requireOrgRole(event, orgId)

  // Protects the Stripe sandbox. The demo shares one daily budget across all
  // visitors; each real org has its own, so demo traffic can't use it up.
  await enforceRateLimits(event, [
    { key: `simulate:ip:${clientIp(event)}`, max: 5, window: '1 hour' },
    membership.isDemo
      ? { key: 'simulate:demo', max: 100, window: '1 day' }
      : { key: `simulate:org:${orgId}`, max: 200, window: '1 day' },
  ], 'Simulation limit reached. Try again later.')

  const { items, customer } = randomOrder()
  const queued = await enqueue(useServiceClient(event), {
    orgId,
    provider: 'stripe',
    action: 'simulate_payment',
    // Each click is a new purchase; retries of THIS job reuse the key.
    idempotencyKey: `stripe.simulate_payment:${randomUUID()}`,
    input: { items, customer },
  })

  processSoon(event)
  return { event_id: queued.id, customer: customer.name, items: items.length }
})
