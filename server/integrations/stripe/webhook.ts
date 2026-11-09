import type { RuntimeConfig } from 'nuxt/schema'
import { z } from 'zod'
import type { Tables } from '../../../shared/types/database.types'
import { onOrderPaid } from '../../flows/order-flow'
import { errorMessage, PermanentError } from '../../lib/errors'
import { recordSyncCall } from '../../lib/event-log'
import type { ActionContext, ActionResult, RawWebhook, VerifiedWebhook } from '../types'
import { stripeRequest } from './api'
import { chargeSchema, paymentIntentSchema, parseLineItems, stripeEventSchema, type PaymentIntent } from './schemas'
import { verifyStripeSignature } from './signature'

const UNIQUE_VIOLATION = '23505'

/** The only Stripe event OpsHub acts on (ADR 0005). */
const HANDLED_TYPES = new Set(['payment_intent.succeeded'])

export function verify(raw: RawWebhook, config: RuntimeConfig): VerifiedWebhook {
  verifyStripeSignature(raw.body, raw.headers['stripe-signature'], config.stripeWebhookSecret)

  const event = stripeEventSchema.parse(JSON.parse(raw.body))

  // Test mode only. Outbound calls already refuse live keys; this stops a
  // misconfigured live webhook secret from turning live events into orders.
  if (event.livemode) throw new Error('Live-mode Stripe events are not accepted')

  const orgId = z.uuid().safeParse((event.data.object as { metadata?: { org_id?: unknown } }).metadata?.org_id)

  return {
    externalId: event.id,
    type: event.type,
    orgId: orgId.success ? orgId.data : null,
    // Events we don't use (e.g. charge.*, which carry billing addresses and
    // card details) are recorded by id and type only. The inspector is
    // visible to every member, and to everyone in the public demo, so we
    // keep no personal data we don't need.
    payload: HANDLED_TYPES.has(event.type)
      ? event
      : { id: event.id, type: event.type, note: 'Payload not stored: OpsHub does not use this event type.' },
  }
}

/**
 * Runs in the worker. Both purchase paths (real Checkout and Simulate order)
 * end in `payment_intent.succeeded`, so this is the single place an order is
 * created (ADR 0005).
 */
export async function handle(ctx: ActionContext, payload: unknown): Promise<ActionResult> {
  const type = (payload as { type?: unknown } | null)?.type
  if (typeof type !== 'string' || !HANDLED_TYPES.has(type)) {
    return { status: 'ignored', response: { reason: `OpsHub doesn't act on ${String(type)}` } }
  }

  const event = parseOrFail(stripeEventSchema, payload, 'Stripe event')

  const intent = parseOrFail(paymentIntentSchema, event.data.object, 'PaymentIntent')

  // A payment made outside OpsHub (e.g. a bare `stripe trigger`) has no org.
  // That's not an error to retry, just nothing for us to do.
  if (!ctx.event.org_id) {
    return { status: 'ignored', response: { reason: 'PaymentIntent has no OpsHub org_id in its metadata' } }
  }

  const customer = await upsertCustomer(ctx, ctx.event.org_id, intent)
  const { order, created } = await createOrder(ctx, ctx.event.org_id, intent, customer.id)

  if (created) await onOrderPaid(ctx, order)

  return {
    orderId: order.id,
    response: { order_id: order.id, customer_id: customer.id, created, amount_cents: order.amount_cents },
  }
}

/**
 * The customer's email comes from where the purchase path put it: Simulate
 * and demo Checkout set it in metadata; a real Checkout collects it on
 * Stripe's page, so we read it from the charge. That extra API call is
 * recorded in the event log like any other.
 */
async function upsertCustomer(ctx: ActionContext, orgId: string, intent: PaymentIntent) {
  let email = intent.receipt_email ?? intent.metadata.customer_email ?? null
  let name = intent.metadata.customer_name ?? null

  if (!email && intent.latest_charge) {
    const charge = await fetchChargeContact(ctx, orgId, intent.latest_charge)
    email = charge.email
    name ??= charge.name
  }

  if (!email) throw new PermanentError(`PaymentIntent ${intent.id} has no customer email`)

  const { data, error } = await ctx.db
    .from('customers')
    .upsert(
      {
        org_id: orgId,
        email: email.toLowerCase(),
        ...(name ? { name } : {}),
        ...(intent.customer ? { stripe_customer_id: intent.customer } : {}),
      },
      { onConflict: 'org_id,email' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

async function fetchChargeContact(ctx: ActionContext, orgId: string, chargeId: string) {
  const startedAt = new Date()
  const call = { orgId, provider: 'stripe', action: 'retrieve_charge', idempotencyKey: `stripe.retrieve_charge:${chargeId}:${startedAt.getTime()}`, input: { charge: chargeId }, startedAt }
  try {
    const { status, data } = await stripeRequest<unknown>({ secretKey: ctx.config.stripeSecretKey, method: 'GET', path: `/charges/${chargeId}` })
    const charge = parseOrFail(chargeSchema, data, 'Charge')
    // Log only what we keep, not the charge (it holds card and address details).
    await recordSyncCall(ctx.db, { ...call, outcome: { ok: true, httpStatus: status, response: { id: charge.id } } })
    return { email: charge.billing_details.email ?? null, name: charge.billing_details.name ?? null }
  }
  catch (error) {
    await recordSyncCall(ctx.db, { ...call, outcome: { ok: false, error: errorMessage(error) } })
    throw error
  }
}

async function createOrder(
  ctx: ActionContext,
  orgId: string,
  intent: PaymentIntent,
  customerId: string,
): Promise<{ order: Tables<'orders'>, created: boolean }> {
  const { data, error } = await ctx.db
    .from('orders')
    .insert({
      org_id: orgId,
      customer_id: customerId,
      status: 'pending',
      source: intent.metadata.source ?? 'checkout',
      amount_cents: intent.amount_received ?? intent.amount,
      currency: intent.currency.toLowerCase(),
      line_items: parseLineItems(intent.metadata.line_items),
      stripe_payment_intent_id: intent.id,
    })
    .select()
    .single()

  if (error?.code === UNIQUE_VIOLATION) {
    // Already recorded (e.g. Stripe delivered two different events for one
    // payment). The unique constraint on stripe_payment_intent_id is the
    // guarantee; this branch just reports it.
    const { data: existing, error: lookupError } = await ctx.db
      .from('orders')
      .select()
      .eq('stripe_payment_intent_id', intent.id)
      .single()
    if (lookupError) throw lookupError
    return { order: existing, created: false }
  }
  if (error) throw error

  const { data: paid, error: transitionError } = await ctx.db
    .rpc('transition_order', { target_order: data.id, new_status: 'paid', caused_by: ctx.event.id })
    .single()
  if (transitionError) throw transitionError

  return { order: paid, created: true }
}

function parseOrFail<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    // Malformed provider data won't fix itself on retry.
    throw new PermanentError(`Unexpected ${what} shape: ${z.prettifyError(result.error)}`)
  }
  return result.data
}
