import { z } from 'zod'
import { onOrderStatusChanged } from '../../flows/order-flow'
import { PermanentError } from '../../lib/errors'
import type { ActionContext, ActionResult, Integration } from '../types'

const stuckInput = z.object({
  orderId: z.uuid(),
  previousStatus: z.enum(['label_created', 'in_transit', 'out_for_delivery']),
})

/**
 * Reacts to `order.stuck`, which the database's every-5-minutes detection job
 * enqueues (migration 20261109142559_stuck_orders.sql). Detection lives in
 * SQL; the follow-up runs here, through the same flow as a tracking update,
 * so a stuck order gets the same notifications and retries.
 */
async function orderStuck(ctx: ActionContext, rawInput: Record<string, unknown>): Promise<ActionResult> {
  const input = stuckInput.safeParse(rawInput)
  if (!input.success) throw new PermanentError(`Invalid order.stuck input: ${z.prettifyError(input.error)}`)

  const { data: order, error } = await ctx.db.from('orders').select().eq('id', input.data.orderId).maybeSingle()
  if (error) throw error
  if (!order || order.org_id !== ctx.event.org_id) throw new PermanentError('Order not found in this organization')

  // Moved on since detection (e.g. a tracker update arrived): nothing to do.
  if (order.status !== 'stuck') {
    return { status: 'ignored', orderId: order.id, response: { reason: `Order is ${order.status} now` } }
  }

  // Stuck, moved, and stuck again before the worker ran: only the latest
  // stall's event acts, so the follow-ups (e.g. a Slack alert) happen once.
  const { data: latest, error: historyError } = await ctx.db
    .from('order_status_history')
    .select('event_id')
    .eq('order_id', order.id)
    .eq('to_status', 'stuck')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (historyError) throw historyError
  if (latest?.event_id !== ctx.event.id) {
    return { status: 'ignored', orderId: order.id, response: { reason: 'Superseded by a later stall' } }
  }

  await onOrderStatusChanged(ctx, order, input.data.previousStatus)
  return { orderId: order.id, response: { order_status: 'stuck', previous_status: input.data.previousStatus } }
}

/** OpsHub's own internal events: work the database schedules for the app. */
export const opshub: Integration = {
  id: 'opshub',
  kind: 'platform',
  displayName: 'OpsHub',
  actions: {
    'order.stuck': orderStuck,
  },
}
