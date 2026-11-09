import type { Tables } from '../../shared/types/database.types'
import type { ActionContext } from '../integrations/types'

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
export async function onOrderStatusChanged(_ctx: ActionContext, _order: Order, _from: OrderStatus): Promise<void> {
  // Phase 3: Slack notification when an order ships, is delivered, fails or gets stuck.
  // Phase 4: move the HubSpot deal stage.
}
