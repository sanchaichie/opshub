import type { Enums } from '../../../shared/types/database.types'

type OrderStatus = Enums<'order_status'>

/** Transitions worth a Slack message. Everything else stays quiet. */
export const NOTIFY_ON: ReadonlySet<OrderStatus> = new Set(['in_transit', 'delivered', 'exception', 'stuck'])

const COPY: Partial<Record<OrderStatus, { emoji: string, headline: string }>> = {
  in_transit: { emoji: ':truck:', headline: 'Order shipped' },
  delivered: { emoji: ':white_check_mark:', headline: 'Order delivered' },
  exception: { emoji: ':rotating_light:', headline: 'Delivery problem' },
  stuck: { emoji: ':hourglass:', headline: 'Order looks stuck' },
}

export interface OrderSummary {
  id: string
  status: OrderStatus
  amountCents: number
  currency: string
  customerName: string | null
  carrier: string | null
  trackingCode: string | null
}

/**
 * Customer data is untrusted (in the demo, visitors choose it). Escape Slack's
 * control characters, drop formatting characters, and cap the length. The
 * blocks also set `verbatim: true`, so Slack doesn't auto-link URLs or
 * domains hidden in a name (e.g. "Refund at evil.example").
 */
const escape = (text: string) => text
  .replace(/[*_~`]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .slice(0, 100)

export function buildOrderMessage(order: OrderSummary, siteUrl: string) {
  const copy = COPY[order.status] ?? { emoji: ':package:', headline: `Order ${order.status.replaceAll('_', ' ')}` }
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency.toUpperCase() }).format(order.amountCents / 100)
  const customer = escape(order.customerName ?? 'Unknown customer')
  const url = `${siteUrl.replace(/\/$/, '')}/orders/${order.id}`
  const tracking = order.trackingCode ? `${escape(order.carrier ?? '')} ${escape(order.trackingCode)}`.trim() : 'not yet'

  return {
    // Plain-text fallback for notifications and screen readers.
    text: `${copy.headline}: ${customer} (${amount})`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', verbatim: true, text: `${copy.emoji} *${copy.headline}*: ${customer} · ${amount}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', verbatim: true, text: `Tracking: ${tracking}` }] },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in OpsHub' }, url }] },
    ],
  }
}

/** Only Slack's own webhook host is ever posted to (prevents a stored URL being used for SSRF). */
export function isSlackWebhookUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'hooks.slack.com' && parsed.pathname.startsWith('/services/')
  }
  catch {
    return false
  }
}
