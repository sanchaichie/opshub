import { z } from 'zod'
import { getConnection, markConnectionError } from '../../lib/connections'
import { PermanentError } from '../../lib/errors'
import { httpRequest } from '../../lib/http'
import type { ActionContext, ActionResult, Integration } from '../types'
import { buildOrderEmbed, canonicalWebhookUrl, isDiscordWebhookUrl } from './message'

/**
 * Discord: order notifications in a channel, via a webhook URL the org pastes
 * (no OAuth app needed). Added in Phase 7 to show what a new integration
 * costs: see docs/plan/tasks/phase-7/01-discord.md for the file count.
 */

const webhookInfo = z.looseObject({ name: z.string().nullable().optional(), channel_id: z.string() })

async function notifyOrder(ctx: ActionContext, rawInput: Record<string, unknown>): Promise<ActionResult> {
  const input = z.object({ orderId: z.uuid() }).safeParse(rawInput)
  if (!input.success) throw new PermanentError('Expected { orderId }')

  const { data: order, error } = await ctx.db
    .from('orders')
    .select('id, org_id, status, amount_cents, currency, carrier, tracking_code, customers(name)')
    .eq('id', input.data.orderId)
    .maybeSingle()
  if (error) throw error
  if (!order || order.org_id !== ctx.event.org_id) throw new PermanentError('Order not found in this organization')

  const connection = await getConnection<{ webhook_url?: string }>(ctx, 'discord')
  const url = connection.credentials.webhook_url
  if (!isDiscordWebhookUrl(url) && !(import.meta.dev && typeof url === 'string' && /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url))) {
    throw new PermanentError('Stored Discord webhook URL is not a Discord URL')
  }

  const body = buildOrderEmbed({
    id: order.id, status: order.status, amountCents: order.amount_cents, currency: order.currency,
    customerName: order.customers?.name ?? null, carrier: order.carrier, trackingCode: order.tracking_code,
  }, ctx.config.public.siteUrl)

  try {
    const target = new URL(url)
    target.searchParams.set('wait', 'true')
    const res = await httpRequest({ url: target.toString(), method: 'POST', body })
    return { httpStatus: res.status, orderId: order.id, response: { posted: body.embeds[0]!.title } }
  }
  catch (err) {
    // 404: the webhook was deleted in Discord. Ask the org to reconnect.
    if ((err as { details?: { httpStatus?: number } }).details?.httpStatus === 404) {
      await markConnectionError(ctx, connection, 'Discord webhook no longer exists; reconnect Discord')
    }
    throw err
  }
}

export const discord: Integration = {
  id: 'discord',
  kind: 'connected',
  displayName: 'Discord',
  manualConnect: {
    label: 'Discord webhook URL',
    placeholder: 'https://discord.com/api/webhooks/…',
    async connect(value) {
      if (!isDiscordWebhookUrl(value)) throw new PermanentError('That isn\'t a Discord webhook URL')
      // Store only the canonical URL: a pasted ?thread_id=… would otherwise
      // be kept and silently redirect posts to a different thread.
      const url = canonicalWebhookUrl(value)
      // Confirm it exists (GET returns the webhook's details, not a message).
      const info = webhookInfo.safeParse((await httpRequest<unknown>({ url })).data)
      if (!info.success) throw new PermanentError('Discord didn\'t recognise that webhook')
      return {
        credentials: { webhook_url: url },
        accountLabel: info.data.name ? `${info.data.name} webhook` : 'Discord webhook',
        metadata: { channel_id: info.data.channel_id },
      }
    },
  },
  actions: {
    notify_order: notifyOrder,
  },
}
