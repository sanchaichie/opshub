import type { ServiceClient } from '../types'
import type { OrderContext } from './prompts'

/** What Claude sees about an order: operational facts only, first name only. */
export async function orderContext(db: ServiceClient, orderId: string): Promise<{ orgId: string, context: OrderContext } | null> {
  const [order, history, events] = await Promise.all([
    db.from('orders')
      .select('id, org_id, status, amount_cents, currency, line_items, carrier, tracking_code, created_at, customers(name), organizations!inner(name)')
      .eq('id', orderId)
      .maybeSingle(),
    db.from('order_status_history').select('to_status, created_at').eq('order_id', orderId).order('created_at'),
    db.from('events').select('provider, type, status, attempts, error, created_at').eq('order_id', orderId).order('created_at').limit(30),
  ])
  for (const r of [order, history, events]) if (r.error) throw r.error
  if (!order.data) return null

  const o = order.data
  const items = (Array.isArray(o.line_items) ? o.line_items : []) as { name: string, quantity: number }[]
  return {
    orgId: o.org_id,
    context: {
      store: o.organizations.name,
      customerFirstName: o.customers?.name?.trim().split(/\s+/)[0] ?? null,
      status: o.status,
      placedAt: o.created_at,
      total: new Intl.NumberFormat('en-US', { style: 'currency', currency: o.currency.toUpperCase() }).format(o.amount_cents / 100),
      items: items.map(i => ({ name: i.name, quantity: i.quantity })),
      carrier: o.carrier,
      trackingCode: o.tracking_code,
      history: (history.data ?? []).map(h => ({ at: h.created_at, to: h.to_status })),
      events: (events.data ?? []).map(e => ({ at: e.created_at, provider: e.provider, type: e.type, status: e.status, attempts: e.attempts, error: e.error })),
    },
  }
}
