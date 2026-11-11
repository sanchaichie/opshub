import type { Enums } from '../../../shared/types/database.types'

type OrderStatus = Enums<'order_status'>

/**
 * HubSpot's default pipeline describes the *sale*, so a deal is won once
 * paid and lost if cancelled. Fulfilment progress (shipped, delivered…) goes
 * in the `opshub_status` property instead of cluttering the sales pipeline.
 */
export function dealStageFor(status: OrderStatus): string {
  if (status === 'cancelled') return 'closedlost'
  if (status === 'pending') return 'appointmentscheduled'
  return 'closedwon'
}

/** "Ava van der Berg" → firstname "Ava", lastname "van der Berg". */
export function splitName(name: string | null): { firstname?: string, lastname?: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return {}
  return parts.length === 1 ? { firstname: parts[0] } : { firstname: parts[0], lastname: parts.slice(1).join(' ') }
}

export function contactInput(customer: { email: string, name: string | null }) {
  return { idProperty: 'email', id: customer.email, properties: { email: customer.email, ...splitName(customer.name) } }
}

export function dealInput(order: { id: string, status: OrderStatus, amount_cents: number, currency: string }, customerName: string | null) {
  return {
    idProperty: 'opshub_order_id',
    id: order.id,
    properties: {
      opshub_order_id: order.id,
      dealname: `OpsHub order · ${customerName ?? 'Unknown customer'}`,
      amount: (order.amount_cents / 100).toFixed(2),
      deal_currency_code: order.currency.toUpperCase(),
      pipeline: 'default',
      dealstage: dealStageFor(order.status),
      opshub_status: order.status,
    },
  }
}
