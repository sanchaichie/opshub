import { createHash } from 'node:crypto'

/**
 * Calendar lets the client choose an event's id (base32hex: 0-9 and a-v).
 * Deriving it from the order and start time makes booking retry-safe: a
 * second insert with the same id is rejected (409) instead of creating a
 * duplicate meeting. Hex digits are a subset of base32hex.
 */
export function eventIdFor(orderId: string, startsAt: string): string {
  return `opshub${createHash('sha256').update(`${orderId}|${startsAt}`).digest('hex').slice(0, 40)}`
}

export const CALL_MINUTES = 30

export function callEvent({ eventId, startsAt, attendee, customerName, orgName, orderUrl }: {
  eventId: string
  startsAt: string
  attendee: string
  customerName: string | null
  orgName: string
  orderUrl: string
}) {
  const start = new Date(startsAt)
  const end = new Date(start.getTime() + CALL_MINUTES * 60_000)
  return {
    id: eventId,
    summary: `${orgName} × ${customerName ?? 'customer'}: order follow-up`,
    description: `Follow-up call about an order.\n\nOpsHub: ${orderUrl}`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: [{ email: attendee }],
    // Same request id on a retry: Google won't create a second Meet room.
    conferenceData: { createRequest: { requestId: eventId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
  }
}

/** Only real Meet links are ever shown as links in OpsHub. */
export const isMeetLink = (url: unknown): url is string => typeof url === 'string' && /^https:\/\/meet\.google\.com\/[a-z-]+$/.test(url)
