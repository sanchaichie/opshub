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

/** Chat integrations that get order notifications; each implements `notify_order`. */
const CHAT_TARGETS = ['slack', 'discord'] as const

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
  await syncCrm(ctx, order)
}

/** Any status change after payment (tracking updates, stuck detection). */
export async function onOrderStatusChanged(ctx: ActionContext, order: Order, _from: OrderStatus): Promise<void> {
  if (NOTIFY_ON.has(order.status)) {
    for (const provider of CHAT_TARGETS) {
      if (!await isConnected(ctx.db, order.org_id, provider)) continue
      await ctx.enqueue({
        provider,
        action: 'notify_order',
        // One message per transition: status_changed_at is unique to it.
        idempotencyKey: `${provider}.notify_order:${order.id}:${order.status}:${order.status_changed_at}`,
        input: { orderId: order.id },
        orderId: order.id,
      })
    }
  }
  await syncCrm(ctx, order)

  if (order.status === 'delivered' && await isConnected(ctx.db, order.org_id, 'google')) {
    await ctx.enqueue({
      provider: 'google',
      action: 'send_follow_up',
      // Once per order, ever: a re-delivered tracker update can't re-send it.
      idempotencyKey: `google.send_follow_up:${order.id}`,
      input: { orderId: order.id },
      orderId: order.id,
    })
  }
}

/** Keeps the HubSpot contact + deal current, one sync per order state. */
async function syncCrm(ctx: ActionContext, order: Order): Promise<void> {
  if (!await isConnected(ctx.db, order.org_id, 'hubspot')) return
  await ctx.enqueue({
    provider: 'hubspot',
    action: 'sync_deal',
    idempotencyKey: `hubspot.sync_deal:${order.id}:${order.status}:${order.status_changed_at}`,
    input: { orderId: order.id },
    orderId: order.id,
  })
}
