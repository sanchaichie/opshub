import type { Enums } from '../../../shared/types/database.types'

export type OrderStatus = Enums<'order_status'>

/** Every tracker status EasyPost documents. */
export const TRACKER_STATUSES = [
  'pre_transit', 'in_transit', 'out_for_delivery', 'delivered', 'available_for_pickup',
  'return_to_sender', 'failure', 'cancelled', 'error', 'unknown',
] as const
export type TrackerStatus = (typeof TRACKER_STATUSES)[number]

/** What each tracker status means for the order. `null`: no change. */
const MAPPING: Record<TrackerStatus, OrderStatus | null> = {
  pre_transit: 'label_created',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  available_for_pickup: 'out_for_delivery',
  delivered: 'delivered',
  return_to_sender: 'exception',
  failure: 'exception',
  cancelled: 'exception',
  error: 'exception',
  unknown: null,
}

/** Forward progress along the normal journey. */
const PROGRESS: Partial<Record<OrderStatus, number>> = {
  pending: 0, paid: 1, label_created: 2, in_transit: 3, out_for_delivery: 4, delivered: 5,
}

/**
 * The order status a tracker update should produce, or null to leave the order
 * alone. Carriers deliver updates late and out of order, so the rules are:
 *
 * - `delivered` and `cancelled` are final: nothing moves an order out of them.
 * - Normal progress never goes backwards (a late "in_transit" after
 *   "out_for_delivery" is ignored).
 * - `stuck` and `exception` are left by real tracking progress (in transit
 *   or later): a parcel that starts moving again is no longer stuck.
 * - An exception can interrupt any undelivered order.
 */
export function nextOrderStatus(current: OrderStatus, trackerStatus: string): OrderStatus | null {
  const target = MAPPING[trackerStatus as TrackerStatus] ?? null
  if (!target || target === current) return null
  if (current === 'delivered' || current === 'cancelled') return null

  if (target === 'exception') return 'exception'
  // Leaving stuck/exception needs real movement: a late pre_transit replay
  // must not send a parcel that was in transit back to label_created.
  if (current === 'stuck' || current === 'exception') return target === 'label_created' ? null : target

  const from = PROGRESS[current] ?? 0
  const to = PROGRESS[target] ?? 0
  return to > from ? target : null
}
