import type { Tables } from '../../shared/types/database.types'
import type { ActionContext } from '../integrations/types'
import { NOTIFY_ON } from '../integrations/slack/message'
import { isConnected } from '../lib/connections'

/**
 * What happens next in an order's life. Integration handlers report domain
 * facts ("this order was paid"); this file decides the follow-up work. That
 * keeps cross-provider choreography in one readable place instead of having
 * Stripe's code know about EasyPost, HubSpot or Slack.
 *
 * Every follow-up is enqueued with a deterministic idempotency key, so
 * replaying the triggering webhook never duplicates the work.
 */

export type Order = Tables<'orders'>

export type OrderStatus = Order['status']

/** Stripe confirmed payment: ship it. */
export async function onOrderPaid(ctx: ActionContext, order: Order): Promise<void> {
  if (order.shipping_address) {
    await ctx.enqueue({
      provider: 'easypost',
      action: 'create_shipment',
      idempotencyKey: `easypost.create_shipment:${order.id}`,
      input: { orderId: order.id },
      orderId: order.id,
    })
  }
  // Phase 4: HubSpot contact + deal.
}

/** Any status change after payment (tracking updates, stuck detection). */
export async function onOrderStatusChanged(ctx: ActionContext, order: Order, _from: OrderStatus): Promise<void> {
  if (NOTIFY_ON.has(order.status) && await isConnected(ctx.db, order.org_id, 'slack')) {
    await ctx.enqueue({
      provider: 'slack',
      action: 'notify_order',
      // One message per transition: status_changed_at is unique to it.
      idempotencyKey: `slack.notify_order:${order.id}:${order.status}:${order.status_changed_at}`,
      input: { orderId: order.id },
      orderId: order.id,
    })
  }
  // Phase 4: move the HubSpot deal stage.
}
