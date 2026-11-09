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

export async function onOrderPaid(_ctx: ActionContext, _order: Order): Promise<void> {
  // Phase 2: ctx.enqueue({ provider: 'easypost', action: 'create_shipment', idempotencyKey: `easypost.create_shipment:${order.id}`, ... })
  // Phase 4: ctx.enqueue({ provider: 'hubspot', action: 'sync_deal', ... })
}
