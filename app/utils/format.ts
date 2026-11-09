import type { Enums } from '~~/shared/types/database.types'

export type OrderStatus = Enums<'order_status'>
export type EventStatus = Enums<'event_status'>
type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

export function formatMoney(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1],
]

/** "3 minutes ago", "in 20 seconds". */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') return relative.format(Math.round(seconds / size), unit)
  }
  return '—'
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' })
}

export const orderStatusColor: Record<OrderStatus, BadgeColor> = {
  pending: 'neutral',
  paid: 'info',
  label_created: 'secondary',
  in_transit: 'primary',
  out_for_delivery: 'primary',
  delivered: 'success',
  exception: 'error',
  stuck: 'warning',
  cancelled: 'neutral',
}

export const eventStatusColor: Record<EventStatus, BadgeColor> = {
  pending: 'neutral',
  processing: 'info',
  succeeded: 'success',
  failed: 'warning',
  dead: 'error',
  ignored: 'neutral',
}

export const humanize = (value: string) => value.replaceAll('_', ' ')
