import { z } from 'zod'
import { withAuthRetry } from '../../lib/connections'
import { PermanentError } from '../../lib/errors'
import { httpRequest } from '../../lib/http'
import type { ActionContext, ActionResult, Integration } from '../types'
import { callEvent, eventIdFor, isMeetLink } from './calendar'
import { buildRawMessage, followUpEmail, recipientFor } from './mail'

type Credentials = { access_token: string }

/** Shared hourly budget for the public demo: visitors can't flood the owner's inbox or calendar. */
const DEMO_GOOGLE_ACTIONS_PER_HOUR = 20

async function demoBudgetSpent(ctx: ActionContext): Promise<boolean> {
  const { data, error } = await ctx.db
    .rpc('bump_usage', { counter_key: 'google:demo', window_size: '1 hour', max_count: DEMO_GOOGLE_ACTIONS_PER_HOUR })
    .single()
  if (error) throw error
  return !data.allowed
}

async function loadOrder(ctx: ActionContext, orderId: string) {
  const { data: order, error } = await ctx.db
    .from('orders')
    .select('id, org_id, status, line_items, customers(name, email), organizations!inner(name, is_demo)')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw error
  if (!order || order.org_id !== ctx.event.org_id) throw new PermanentError('Order not found in this organization')
  return order
}

/**
 * Sends the "your order arrived" email from the org's Gmail.
 *
 * Delivery is at-least-once, not exactly-once: Gmail's send API has no
 * idempotency key, so if the worker crashes in the instant after Gmail
 * accepts the message and before the result is recorded, the retry sends it
 * again. The enqueue key (one per order) prevents every other kind of repeat.
 */
export function sendFollowUp(google: () => Integration) {
  return async (ctx: ActionContext, rawInput: Record<string, unknown>): Promise<ActionResult> => {
    const input = z.object({ orderId: z.uuid() }).safeParse(rawInput)
    if (!input.success) throw new PermanentError('Expected { orderId }')
    const order = await loadOrder(ctx, input.data.orderId)

    if (order.organizations.is_demo && await demoBudgetSpent(ctx)) {
      return { status: 'ignored', orderId: order.id, response: { reason: 'Demo email budget for this hour is used up' } }
    }

    const to = recipientFor(order.customers?.email ?? null, order.organizations.is_demo, ctx.config.demoEmailAllowlist)
    const items = (Array.isArray(order.line_items) ? order.line_items : []) as { name: string, quantity: number }[]
    const raw = buildRawMessage({ to, ...followUpEmail({ customerName: order.customers?.name ?? null, orgName: order.organizations.name, items }) })

    const { status, data } = await withAuthRetry<Credentials, Awaited<ReturnType<typeof httpRequest<{ id: string }>>>>(ctx, google(), ({ access_token }) =>
      httpRequest<{ id: string }>({
        url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        method: 'POST',
        headers: { authorization: `Bearer ${access_token}` },
        body: { raw },
      }))

    return { httpStatus: status, orderId: order.id, response: { message_id: data.id, demo_redirected: order.organizations.is_demo } }
  }
}

const bookInput = z.object({ orderId: z.uuid(), startsAt: z.iso.datetime({ offset: true }) })

/** Books a 30-minute call with a Meet link. Retry-safe: the event id is derived from order + time. */
export function bookCall(google: () => Integration) {
  return async (ctx: ActionContext, rawInput: Record<string, unknown>): Promise<ActionResult> => {
    const input = bookInput.safeParse(rawInput)
    if (!input.success) throw new PermanentError('Expected { orderId, startsAt }')
    const order = await loadOrder(ctx, input.data.orderId)

    if (order.organizations.is_demo && await demoBudgetSpent(ctx)) {
      return { status: 'ignored', orderId: order.id, response: { reason: 'Demo calendar budget for this hour is used up' } }
    }

    const eventId = eventIdFor(order.id, input.data.startsAt)
    const event = callEvent({
      eventId,
      startsAt: input.data.startsAt,
      attendee: recipientFor(order.customers?.email ?? null, order.organizations.is_demo, ctx.config.demoEmailAllowlist),
      customerName: order.customers?.name ?? null,
      orgName: order.organizations.name,
      orderUrl: `${ctx.config.public.siteUrl.replace(/\/$/, '')}/orders/${order.id}`,
    })

    const created = await withAuthRetry<Credentials, { status: number, data: Record<string, unknown> }>(ctx, google(), async ({ access_token }) => {
      const auth = { authorization: `Bearer ${access_token}` }
      try {
        return await httpRequest<Record<string, unknown>>({
          url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
          method: 'POST',
          headers: auth,
          body: event,
        })
      }
      catch (error) {
        // 409: this exact booking already exists (a retry). Use it.
        if ((error as { details?: { httpStatus?: number } }).details?.httpStatus !== 409) throw error
        return httpRequest<Record<string, unknown>>({ url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, headers: auth })
      }
    })

    const meet = created.data.hangoutLink
    return {
      httpStatus: created.status,
      orderId: order.id,
      response: { event_id: eventId, starts_at: event.start.dateTime, meet_link: isMeetLink(meet) ? meet : null },
    }
  }
}
