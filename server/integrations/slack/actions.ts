import { z } from 'zod'
import { getConnection, markConnectionError } from '../../lib/connections'
import { PermanentError } from '../../lib/errors'
import { httpRequest } from '../../lib/http'
import type { ActionContext, ActionResult } from '../types'
import { buildOrderMessage, isSlackWebhookUrl } from './message'

const input = z.object({ orderId: z.uuid() })

/** Shared hourly budget for the public demo, so visitors can't flood the owner's channel. */
const DEMO_MESSAGES_PER_HOUR = 30

/**
 * Posts an order update to the org's Slack channel. Reads the order's
 * CURRENT state, so a delayed retry never posts stale information.
 */
export async function notifyOrder(ctx: ActionContext, rawInput: Record<string, unknown>): Promise<ActionResult> {
  const parsed = input.safeParse(rawInput)
  if (!parsed.success) throw new PermanentError('Expected { orderId }')

  const { data: order, error } = await ctx.db
    .from('orders')
    .select('id, org_id, status, amount_cents, currency, carrier, tracking_code, customers(name), organizations!inner(is_demo)')
    .eq('id', parsed.data.orderId)
    .maybeSingle()
  if (error) throw error
  if (!order || order.org_id !== ctx.event.org_id) throw new PermanentError('Order not found in this organization')

  if (order.organizations.is_demo) {
    const { data: budget, error: budgetError } = await ctx.db
      .rpc('bump_usage', { counter_key: 'slack:demo', window_size: '1 hour', max_count: DEMO_MESSAGES_PER_HOUR })
      .single()
    if (budgetError) throw budgetError
    if (!budget.allowed) return { status: 'ignored', orderId: order.id, response: { reason: 'Demo Slack budget for this hour is used up' } }
  }

  const connection = await getConnection<{ webhook_url?: string }>(ctx, 'slack')
  const webhookUrl = connection.credentials.webhook_url
  if (!isSlackWebhookUrl(webhookUrl) && !isLocalTestSink(webhookUrl)) {
    throw new PermanentError('Stored Slack webhook URL is not a Slack URL')
  }

  const message = buildOrderMessage({
    id: order.id,
    status: order.status,
    amountCents: order.amount_cents,
    currency: order.currency,
    customerName: order.customers?.name ?? null,
    carrier: order.carrier,
    trackingCode: order.tracking_code,
  }, ctx.config.public.siteUrl)

  try {
    const res = await httpRequest({ url: webhookUrl!, method: 'POST', body: message })
    return { httpStatus: res.status, orderId: order.id, response: { posted: message.text, channel: connection.metadata.channel ?? null } }
  }
  catch (err) {
    // 404/410 from Slack: the webhook was removed (app uninstalled, channel
    // archived). Flag the connection so the org knows to reconnect.
    const status = (err as { details?: { httpStatus?: number } }).details?.httpStatus
    if (status === 404 || status === 410) {
      await markConnectionError(ctx, connection, 'Slack webhook no longer exists; reconnect Slack')
    }
    throw err
  }
}

/**
 * Local development only: lets the e2e test point a connection at a capture
 * server on localhost. `import.meta.dev` is replaced with a constant at build
 * time, so production builds can't take this branch, whatever the runtime
 * environment says.
 */
function isLocalTestSink(url: unknown): boolean {
  if (!import.meta.dev || typeof url !== 'string') return false
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')
  }
  catch {
    return false
  }
}
