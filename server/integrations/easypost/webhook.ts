import type { RuntimeConfig } from 'nuxt/schema'
import { z } from 'zod'
import { onOrderStatusChanged } from '../../flows/order-flow'
import { PermanentError, RetryableError } from '../../lib/errors'
import type { ActionContext, ActionResult, RawWebhook, ServiceClient, VerifiedWebhook } from '../types'
import { easypostEventSchema, trackerSchema } from './schemas'
import { verifyEasyPostSignature } from './signature'
import { nextOrderStatus } from './status'

const isTrackerEvent = (type: string) => type === 'tracker.created' || type === 'tracker.updated'

export function verify(raw: RawWebhook, config: RuntimeConfig): VerifiedWebhook {
  verifyEasyPostSignature(raw.body, raw.headers['x-hmac-signature'], config.easypostWebhookSecret)

  const event = easypostEventSchema.parse(JSON.parse(raw.body))
  if (event.mode !== 'test') throw new Error('Production-mode EasyPost events are not accepted')

  return {
    externalId: event.id,
    type: event.description,
    // Trackers carry no metadata; resolveOrgId finds the org via the order.
    orgId: null,
    // Keep only what we use (see the matching rule in the Stripe module).
    payload: isTrackerEvent(event.description)
      ? event
      : { id: event.id, description: event.description, note: 'Payload not stored: OpsHub does not use this event type.' },
  }
}

/** The globally unique ids a tracker event can be matched on. Never the tracking code. */
const trackerRef = (payload: unknown) => {
  const result = (payload as { result?: { id?: unknown, shipment_id?: unknown } } | null)?.result
  return {
    trackerId: typeof result?.id === 'string' ? result.id : null,
    shipmentId: typeof result?.shipment_id === 'string' ? result.shipment_id : null,
  }
}

/** Tracker webhooks that arrive before startTracking saved the tracker id are retried this many times. */
const UNLINKED_TRACKER_ATTEMPTS = 3

/** Finds the org through the order this tracker belongs to. */
export async function resolveOrgId(db: ServiceClient, webhook: VerifiedWebhook): Promise<string | null> {
  if (!isTrackerEvent(webhook.type)) return null
  const order = await findOrder(db, trackerRef(webhook.payload))
  return order?.org_id ?? null
}

export async function handle(ctx: ActionContext, payload: unknown): Promise<ActionResult> {
  if (!isTrackerEvent(ctx.event.type)) {
    return { status: 'ignored', response: { reason: `OpsHub doesn't act on ${ctx.event.type}` } }
  }

  const tracker = trackerSchema.safeParse((payload as { result?: unknown } | null)?.result)
  if (!tracker.success) throw new PermanentError(`Unexpected tracker shape: ${z.prettifyError(tracker.error)}`)

  const order = await findOrder(ctx.db, { trackerId: tracker.data.id, shipmentId: tracker.data.shipment_id ?? null }, ctx.event.org_id)
  if (!order) {
    // EasyPost sends tracker.created the moment a tracker exists, which can
    // beat startTracking saving its id. Retry briefly instead of guessing.
    if (ctx.event.attempts < UNLINKED_TRACKER_ATTEMPTS) {
      throw new RetryableError('Tracker not linked to an order yet', { retryAfterMs: 5_000 })
    }
    return { status: 'ignored', response: { reason: 'No order matches this tracker', tracker_id: tracker.data.id } }
  }

  // Resolved only now (the webhook beat the link): attach the event to the
  // order's org, so it's visible and its timeline links are valid.
  if (!ctx.event.org_id) {
    const { error } = await ctx.db.from('events').update({ org_id: order.org_id }).eq('id', ctx.event.id).is('org_id', null)
    if (error) throw error
    ctx.event.org_id = order.org_id
  }

  const next = nextOrderStatus(order.status, tracker.data.status)
  if (next) {
    const { data: updated, error } = await ctx.db
      .rpc('transition_order', { target_order: order.id, new_status: next, caused_by: ctx.event.id })
      .single()
    if (error) throw error
    await onOrderStatusChanged(ctx, updated, order.status)
  }

  return {
    orderId: order.id,
    response: {
      tracker_status: tracker.data.status,
      status_detail: tracker.data.status_detail,
      order_status: next ?? order.status,
      changed: Boolean(next),
    },
  }
}

/**
 * Matches ONLY on ids that are globally unique (enforced by unique indexes):
 * the tracker id, then the shipment id. Never the tracking code: EasyPost's
 * test codes are shared by many orders across orgs, and matching on them
 * once let one org's tracker move another org's order (security review, P2-02).
 * Each lookup is a separate parameterized filter.
 */
async function findOrder(db: ServiceClient, ref: { trackerId: string | null, shipmentId: string | null }, orgId?: string | null) {
  const lookups: [column: 'easypost_tracker_id' | 'easypost_shipment_id', value: string | null][] = [
    ['easypost_tracker_id', ref.trackerId],
    ['easypost_shipment_id', ref.shipmentId],
  ]

  for (const [column, value] of lookups) {
    if (!value) continue
    let query = db.from('orders').select('id, org_id, status').eq(column, value)
    if (orgId) query = query.eq('org_id', orgId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (data) return data
  }
  return null
}
