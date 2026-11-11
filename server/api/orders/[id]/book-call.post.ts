import { z } from 'zod'
import { isConnected } from '../../../lib/connections'

const params = z.object({ id: z.uuid() })
const body = z.object({ startsAt: z.iso.datetime({ offset: true }) })

const MIN_LEAD_MS = 15 * 60_000
const MAX_AHEAD_MS = 60 * 86_400_000

/** "Book a call": queues a Google Calendar event with a Meet link for this order's customer. */
export default defineEventHandler(async (event) => {
  // Authenticate first, then validate, then look the order up and check membership.
  await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, params.parse)
  const { startsAt } = await readValidatedBody(event, body.parse)

  const starts = new Date(startsAt).getTime()
  if (starts < Date.now() + MIN_LEAD_MS || starts > Date.now() + MAX_AHEAD_MS) {
    throw createError({ statusCode: 422, statusMessage: 'Pick a time between 15 minutes and 60 days from now' })
  }

  const db = useServiceClient(event)
  const { data: order, error } = await db.from('orders').select('id, org_id').eq('id', id).maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load the order' })
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Order not found' })
  const membership = await requireOrgRole(event, order.org_id)

  // Every booking is a real event + invite on the connected Google account.
  // The demo also gets a shared daily cap and a per-order cap, so rotating
  // IPs can't flood the owner's calendar (the worker has an hourly cap too).
  await enforceRateLimits(event, [
    { key: `book-call:ip:${clientIp(event)}`, max: membership.isDemo ? 5 : 30, window: '1 hour' },
    ...(membership.isDemo
      ? [
          { key: 'book-call:demo', max: 50, window: '1 day' },
          { key: `book-call:order:${order.id}`, max: 3, window: '1 day' },
        ]
      : []),
  ], 'Too many bookings. Try again later.')

  if (!await isConnected(db, order.org_id, 'google')) {
    throw createError({ statusCode: 409, statusMessage: 'Connect Google first (Connections page)' })
  }

  const iso = new Date(starts).toISOString()
  const queued = await enqueue(db, {
    orgId: order.org_id,
    provider: 'google',
    action: 'book_call',
    // Same order + same time = same booking, even if the button is clicked twice.
    idempotencyKey: `google.book_call:${order.id}:${iso}`,
    input: { orderId: order.id, startsAt: iso },
    orderId: order.id,
  })
  processSoon(event)
  return { event_id: queued.id }
})
