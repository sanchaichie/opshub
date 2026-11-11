import { z } from 'zod'
import { withAuthRetry } from '../../lib/connections'
import { PermanentError } from '../../lib/errors'
import type { ActionContext, ActionResult, Integration } from '../types'
import { hubspotRequest } from './api'
import { contactInput, dealInput } from './deals'

const input = z.object({ orderId: z.uuid() })
const upsertResult = z.looseObject({ results: z.array(z.looseObject({ id: z.string() })).min(1) })

/**
 * Brings the order's HubSpot contact and deal up to date. Every call is an
 * upsert on a unique key (contact: email, deal: opshub_order_id), and the
 * association is idempotent, so retries and repeated syncs never create
 * duplicates. Reads the order's CURRENT state, so a late retry can't write
 * stale data.
 */
export function syncDeal(hubspot: () => Integration) {
  return async (ctx: ActionContext, rawInput: Record<string, unknown>): Promise<ActionResult> => {
    const parsed = input.safeParse(rawInput)
    if (!parsed.success) throw new PermanentError('Expected { orderId }')

    const { data: order, error } = await ctx.db
      .from('orders')
      .select('id, org_id, status, amount_cents, currency, customer_id, customers(id, email, name)')
      .eq('id', parsed.data.orderId)
      .maybeSingle()
    if (error) throw error
    if (!order || order.org_id !== ctx.event.org_id) throw new PermanentError('Order not found in this organization')
    if (!order.customers) throw new PermanentError('Order has no customer to sync')
    const customer = order.customers

    const { contactId, dealId } = await withAuthRetry<{ access_token: string }, { contactId: string, dealId: string }>(ctx, hubspot(), async ({ access_token: token }) => {
      const contact = upsertResult.parse((await hubspotRequest({ token, method: 'POST', path: '/crm/v3/objects/contacts/batch/upsert', body: { inputs: [contactInput(customer)] } })).data)
      const deal = upsertResult.parse((await hubspotRequest({ token, method: 'POST', path: '/crm/v3/objects/deals/batch/upsert', body: { inputs: [dealInput(order, customer.name)] } })).data)
      const ids = { contactId: contact.results[0]!.id, dealId: deal.results[0]!.id }
      // The v4 "default" association needs no type id, and is idempotent.
      await hubspotRequest({
        token,
        method: 'PUT',
        path: `/crm/v4/objects/deals/${encodeURIComponent(ids.dealId)}/associations/default/contacts/${encodeURIComponent(ids.contactId)}`,
      })
      return ids
    })

    const [c, o] = await Promise.all([
      ctx.db.from('customers').update({ hubspot_contact_id: contactId }).eq('id', customer.id),
      ctx.db.from('orders').update({ hubspot_deal_id: dealId }).eq('id', order.id),
    ])
    if (c.error) throw c.error
    if (o.error) throw o.error

    return { orderId: order.id, response: { contact_id: contactId, deal_id: dealId, deal_stage: dealInput(order, customer.name).properties.dealstage, opshub_status: order.status } }
  }
}
