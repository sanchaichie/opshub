import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { errorMessage } from '../lib/errors'
import { stripeRequest } from '../integrations/stripe/api'
import { PRODUCTS, randomOrder } from '../integrations/stripe/catalog'

const body = z.object({
  orgId: z.uuid(),
  sku: z.enum(PRODUCTS.map(p => p.sku) as [string, ...string[]]),
})

/**
 * Starts a real Stripe Checkout (test mode). The browser is redirected to
 * Stripe's hosted page; when the test card is paid, Stripe sends
 * payment_intent.succeeded and the same handler as Simulate creates the order.
 */
export default defineEventHandler(async (event) => {
  const { orgId, sku } = await readValidatedBody(event, body.parse)
  const membership = await requireOrgRole(event, orgId)
  await enforceRateLimits(event, [{ key: `checkout:ip:${clientIp(event)}`, max: 20, window: '1 hour' }])

  const product = PRODUCTS.find(p => p.sku === sku)!
  const config = useRuntimeConfig(event)
  const idempotencyKey = `stripe.create_checkout:${randomUUID()}`
  const items = [{ name: product.name, quantity: 1, unit_amount: product.unit_amount }]

  // In the public demo, every visitor can see every customer. Prefill a
  // generated example.com address (Stripe then locks the email field), so
  // trying Checkout never publishes a visitor's real email.
  const demoCustomer = membership.isDemo ? randomOrder().customer : null

  const params = {
    mode: 'payment',
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: product.unit_amount, product_data: { name: product.name } } }],
    success_url: `${config.public.siteUrl}/orders?checkout=success`,
    cancel_url: `${config.public.siteUrl}/orders?checkout=cancelled`,
    ...(demoCustomer ? { customer_email: demoCustomer.email } : {}),
    payment_intent_data: {
      metadata: {
        org_id: orgId,
        source: 'checkout',
        line_items: JSON.stringify(items),
        ...(demoCustomer ? { customer_email: demoCustomer.email, customer_name: demoCustomer.name } : {}),
      },
    },
  }

  const startedAt = new Date()
  const db = useServiceClient(event)
  try {
    const { status, data } = await stripeRequest<{ id: string, url: string }>({
      secretKey: config.stripeSecretKey, method: 'POST', path: '/checkout/sessions', params, idempotencyKey,
    })
    await recordSyncCall(db, { orgId, provider: 'stripe', action: 'create_checkout', idempotencyKey, input: params, startedAt, outcome: { ok: true, httpStatus: status, response: { id: data.id } } })
    return { url: data.url }
  }
  catch (error) {
    await recordSyncCall(db, { orgId, provider: 'stripe', action: 'create_checkout', idempotencyKey, input: params, startedAt, outcome: { ok: false, error: errorMessage(error) } })
    throw createError({ statusCode: 502, statusMessage: 'Could not start Stripe Checkout' })
  }
})
