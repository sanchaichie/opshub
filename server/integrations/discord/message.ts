import type { Enums } from '../../../shared/types/database.types'

type OrderStatus = Enums<'order_status'>

const COPY: Partial<Record<OrderStatus, { emoji: string, headline: string, color: number }>> = {
  in_transit: { emoji: '🚚', headline: 'Order shipped', color: 0x3B82F6 },
  delivered: { emoji: '✅', headline: 'Order delivered', color: 0x22C55E },
  exception: { emoji: '🚨', headline: 'Delivery problem', color: 0xEF4444 },
  stuck: { emoji: '⏳', headline: 'Order looks stuck', color: 0xF59E0B },
}

/**
 * Customer data is untrusted. Escape Discord markdown, including masked
 * links `[text](url)`, and cap the length. Mentions are blocked separately
 * by `allowed_mentions` on every message.
 */
export const escapeMarkdown = (text: string) => text.replace(/([\\*_~`|>[\]()#-])/g, '\\$1').slice(0, 100)

/** The webhook URL without any pasted query string or fragment. */
export const canonicalWebhookUrl = (url: string) => {
  const u = new URL(url)
  return `${u.origin}${u.pathname}`
}

/** Only Discord's own webhook endpoints are ever posted to (no SSRF via a pasted URL). */
export function isDiscordWebhookUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:'
      && ['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'].includes(u.hostname)
      && /^\/api\/webhooks\/\d+\/[\w-]+$/.test(u.pathname)
  }
  catch {
    return false
  }
}

export function buildOrderEmbed(order: { id: string, status: OrderStatus, amountCents: number, currency: string, customerName: string | null, carrier: string | null, trackingCode: string | null }, siteUrl: string) {
  const copy = COPY[order.status] ?? { emoji: '📦', headline: `Order ${order.status.replaceAll('_', ' ')}`, color: 0x6B7280 }
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency.toUpperCase() }).format(order.amountCents / 100)
  return {
    // Never ping anyone, whatever a customer's name contains (e.g. "@everyone").
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${copy.emoji} ${copy.headline}`,
      description: `${escapeMarkdown(order.customerName ?? 'Unknown customer')} · ${amount}`,
      url: `${siteUrl.replace(/\/$/, '')}/orders/${order.id}`,
      color: copy.color,
      fields: [{ name: 'Tracking', value: order.trackingCode ? escapeMarkdown(`${order.carrier ?? ''} ${order.trackingCode}`.trim()) : 'not yet', inline: true }],
    }],
  }
}
