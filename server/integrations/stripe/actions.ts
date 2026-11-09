import { z } from 'zod'
import { PermanentError } from '../../lib/errors'
import type { ActionContext, ActionResult } from '../types'
import { stripeRequest } from './api'
import { orderTotal } from './catalog'
import { lineItemSchema } from './schemas'

const simulateInput = z.object({
  items: z.array(lineItemSchema).min(1).max(10),
  customer: z.object({ name: z.string().min(1).max(80), email: z.email() }),
})

/**
 * "Simulate order": creates and confirms a real test-mode PaymentIntent with
 * Stripe's test card. Stripe then sends a genuine, signed
 * `payment_intent.succeeded` webhook, so the demo exercises exactly the
 * production path (ADR 0005).
 */
export async function simulatePayment(ctx: ActionContext, rawInput: Record<string, unknown>): Promise<ActionResult> {
  const parsed = simulateInput.safeParse(rawInput)
  if (!parsed.success) throw new PermanentError(`Invalid simulate input: ${z.prettifyError(parsed.error)}`)
  const { items, customer } = parsed.data

  if (!ctx.event.org_id) throw new PermanentError('Simulated payments must belong to an org')

  const { status, data } = await stripeRequest<{ id: string, status: string, amount: number }>({
    secretKey: ctx.config.stripeSecretKey,
    method: 'POST',
    path: '/payment_intents',
    // The event's own idempotency key: if this attempt times out after Stripe
    // created the payment, the retry gets the same PaymentIntent back.
    idempotencyKey: ctx.event.idempotency_key ?? undefined,
    params: {
      amount: orderTotal(items),
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      receipt_email: customer.email,
      description: `OpsHub simulated order for ${customer.name}`,
      metadata: {
        org_id: ctx.event.org_id,
        source: 'simulated',
        customer_name: customer.name,
        customer_email: customer.email,
        line_items: JSON.stringify(items),
      },
    },
  })

  return { httpStatus: status, response: { payment_intent: data.id, status: data.status, amount: data.amount } }
}
