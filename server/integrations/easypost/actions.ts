import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { TablesUpdate } from '../../../shared/types/database.types'
import { PermanentError } from '../../lib/errors'
import type { ActionContext, ActionResult } from '../types'
import { easypostRequest } from './api'
import { cheapestRate, orderAddressSchema, shipmentSchema, type Shipment } from './schemas'

/** Where demo parcels ship from. A public building, not a private address. */
const WAREHOUSE = {
  company: 'OpsHub Demo Store',
  street1: '417 Montgomery St',
  city: 'San Francisco',
  state: 'CA',
  zip: '94104',
  country: 'US',
  phone: '4155550100',
}

const orderInput = z.object({ orderId: z.uuid() })

async function loadOrder(ctx: ActionContext, rawInput: Record<string, unknown>) {
  const parsed = orderInput.safeParse(rawInput)
  if (!parsed.success) throw new PermanentError('Expected { orderId }')

  const { data: order, error } = await ctx.db
    .from('orders')
    .select('id, org_id, status, shipping_address, line_items, easypost_shipment_id, easypost_tracker_id, tracking_code, carrier, label_url')
    .eq('id', parsed.data.orderId)
    .maybeSingle()
  if (error) throw error
  // An action may only touch orders of the org it was enqueued for.
  if (!order || order.org_id !== ctx.event.org_id) throw new PermanentError('Order not found in this organization')
  return order
}

function parcelFor(lineItems: unknown) {
  const units = Array.isArray(lineItems)
    ? lineItems.reduce((n: number, item: { quantity?: number }) => n + (item.quantity ?? 1), 0)
    : 1
  return { length: 10, width: 8, height: 4, weight: Math.max(1, units) * 10 } // inches, ounces
}

const parseShipment = (data: unknown): Shipment => {
  const result = shipmentSchema.safeParse(data)
  if (!result.success) throw new PermanentError(`Unexpected EasyPost shipment shape: ${z.prettifyError(result.error)}`)
  return result.data
}

/**
 * Buys the cheapest test-mode label for a paid order.
 *
 * EasyPost has no idempotency-key header, so safety comes from the order row:
 * the shipment id is saved as soon as it exists, a retry re-uses it instead
 * of creating another, and "already purchased" counts as success. A retry
 * can never buy two labels.
 */
export async function createShipment(ctx: ActionContext, rawInput: Record<string, unknown>): Promise<ActionResult> {
  const order = await loadOrder(ctx, rawInput)
  const apiKey = ctx.config.easypostApiKey

  if (order.label_url) {
    return { status: 'ignored', orderId: order.id, response: { reason: 'Label already purchased', shipment_id: order.easypost_shipment_id } }
  }

  const address = orderAddressSchema.safeParse(order.shipping_address)
  if (!address.success) throw new PermanentError('Order has no valid shipping address')

  let shipment: Shipment
  if (order.easypost_shipment_id) {
    shipment = parseShipment((await easypostRequest({ apiKey, method: 'GET', path: `/shipments/${order.easypost_shipment_id}` })).data)
  }
  else {
    const created = await easypostRequest({
      apiKey,
      method: 'POST',
      path: '/shipments',
      body: { shipment: { to_address: address.data, from_address: WAREHOUSE, parcel: parcelFor(order.line_items), reference: order.id } },
    })
    shipment = parseShipment(created.data)
    await saveOrder(ctx, order.id, { easypost_shipment_id: shipment.id })
  }

  let httpStatus = 200
  if (!shipment.postage_label?.label_url) {
    const rate = cheapestRate(shipment)
    if (!rate) throw new PermanentError('EasyPost returned no rates for this shipment')
    try {
      const bought = await easypostRequest({ apiKey, method: 'POST', path: `/shipments/${shipment.id}/buy`, body: { rate: { id: rate.id } } })
      shipment = parseShipment(bought.data)
      httpStatus = bought.status
    }
    catch (error) {
      // A previous attempt bought it but crashed before saving: fetch and continue.
      if (!(error instanceof PermanentError) || !/already/i.test(JSON.stringify(error.details.response ?? ''))) throw error
      shipment = parseShipment((await easypostRequest({ apiKey, method: 'GET', path: `/shipments/${shipment.id}` })).data)
    }
  }

  await saveOrder(ctx, order.id, {
    label_url: shipment.postage_label?.label_url ?? null,
    tracking_code: shipment.tracking_code ?? null,
    carrier: shipment.selected_rate?.carrier ?? null,
  })
  await transition(ctx, order.id, 'label_created')

  // Test-mode labels' trackers never move, so the demo follows the parcel
  // with an EasyPost test tracker instead (see startTracking).
  await ctx.enqueue({ provider: 'easypost', action: 'start_tracking', idempotencyKey: `easypost.start_tracking:${order.id}`, input: { orderId: order.id }, orderId: order.id })

  return {
    httpStatus,
    orderId: order.id,
    response: { shipment_id: shipment.id, carrier: shipment.selected_rate?.carrier, service: shipment.selected_rate?.service, rate: shipment.selected_rate?.rate },
  }
}

/**
 * EasyPost's test tracking codes each play back a scripted journey through
 * real tracker webhooks. Most demo parcels get delivered; some stall (and
 * become `stuck`), and a few fail, so every part of the UI gets exercised.
 */
export const TEST_JOURNEYS = [
  { code: 'EZ4000000004', outcome: 'delivered', weight: 70 },
  { code: 'EZ2000000002', outcome: 'stalls in transit', weight: 15 },
  { code: 'EZ5000000005', outcome: 'returned to sender', weight: 10 },
  { code: 'EZ6000000006', outcome: 'delivery failure', weight: 5 },
] as const

/** Deterministic per order, so a retried job picks the same journey. */
export function journeyFor(orderId: string) {
  const roll = createHash('sha256').update(orderId).digest().readUInt32BE(0) % 100
  let acc = 0
  return TEST_JOURNEYS.find(j => (acc += j.weight) > roll) ?? TEST_JOURNEYS[0]
}

export async function startTracking(ctx: ActionContext, rawInput: Record<string, unknown>): Promise<ActionResult> {
  const order = await loadOrder(ctx, rawInput)
  if (order.easypost_tracker_id) {
    return { status: 'ignored', orderId: order.id, response: { reason: 'Already tracking', tracker_id: order.easypost_tracker_id } }
  }
  const journey = journeyFor(order.id)

  const { status, data } = await easypostRequest<{ id: string, status: string }>({
    apiKey: ctx.config.easypostApiKey,
    method: 'POST',
    path: '/trackers',
    body: { tracker: { tracking_code: journey.code, carrier: 'USPS' } },
  })

  // Tracker webhooks find this order by tracker id (unique), never by the
  // tracking code, which EasyPost's test journeys share across many orders.
  // One that arrives before this save is retried (see webhook.ts).
  await saveOrder(ctx, order.id, { easypost_tracker_id: data.id, tracking_code: journey.code, carrier: 'USPS' })

  return { httpStatus: status, orderId: order.id, response: { tracker_id: data.id, tracking_code: journey.code, journey: journey.outcome } }
}

type ShippingFields = Pick<TablesUpdate<'orders'>, 'easypost_shipment_id' | 'easypost_tracker_id' | 'tracking_code' | 'carrier' | 'label_url'>

async function saveOrder(ctx: ActionContext, orderId: string, fields: ShippingFields) {
  const { error } = await ctx.db.from('orders').update(fields).eq('id', orderId)
  if (error) throw error
}

async function transition(ctx: ActionContext, orderId: string, status: 'label_created') {
  const { error } = await ctx.db.rpc('transition_order', { target_order: orderId, new_status: status, caused_by: ctx.event.id })
  if (error) throw error
}
