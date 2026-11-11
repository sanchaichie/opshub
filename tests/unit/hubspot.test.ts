import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeConfig } from 'nuxt/schema'
import { syncDeal } from '../../server/integrations/hubspot/actions'
import { hubspotRequest } from '../../server/integrations/hubspot/api'
import { contactInput, dealInput, dealStageFor, splitName } from '../../server/integrations/hubspot/deals'
import { DEAL_PROPERTIES, ensureDealProperties, hubspotOAuth } from '../../server/integrations/hubspot/oauth'
import type { ActionContext, Integration } from '../../server/integrations/types'
import { PermanentError, RetryableError } from '../../server/lib/errors'

const config = { hubspotClientId: 'cid', hubspotClientSecret: 'csecret' } as RuntimeConfig
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

afterEach(() => vi.unstubAllGlobals())

describe('deal mapping', () => {
  it.each([
    ['pending', 'appointmentscheduled'],
    ['paid', 'closedwon'],
    ['in_transit', 'closedwon'],
    ['delivered', 'closedwon'],
    ['stuck', 'closedwon'],
    ['cancelled', 'closedlost'],
  ] as const)('%s → %s', (status, stage) => {
    expect(dealStageFor(status)).toBe(stage)
  })

  it('splits names sensibly', () => {
    expect(splitName('Ava van der Berg')).toEqual({ firstname: 'Ava', lastname: 'van der Berg' })
    expect(splitName('Cher')).toEqual({ firstname: 'Cher' })
    expect(splitName('  ')).toEqual({})
    expect(splitName(null)).toEqual({})
  })

  it('keys contacts on email and deals on the unique opshub_order_id', () => {
    expect(contactInput({ email: 'ava@example.com', name: 'Ava Silva' }))
      .toEqual({ idProperty: 'email', id: 'ava@example.com', properties: { email: 'ava@example.com', firstname: 'Ava', lastname: 'Silva' } })
    const deal = dealInput({ id: 'o1', status: 'delivered', amount_cents: 3600, currency: 'usd' }, 'Ava Silva')
    expect(deal).toMatchObject({ idProperty: 'opshub_order_id', id: 'o1' })
    expect(deal.properties).toMatchObject({ opshub_order_id: 'o1', amount: '36.00', deal_currency_code: 'USD', dealstage: 'closedwon', opshub_status: 'delivered' })
  })
})

describe('hubspotRequest', () => {
  it('waits out HubSpot\'s 10-second window when a 429 has no Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ policyName: 'TEN_SECONDLY_ROLLING' }, 429)))
    const error = await hubspotRequest({ token: 't', method: 'GET', path: '/x' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RetryableError)
    expect((error as RetryableError).details.retryAfterMs).toBe(10_000)
  })

  it('keeps an explicit Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 429, { 'retry-after': '3' })))
    const error = await hubspotRequest({ token: 't', method: 'GET', path: '/x' }).catch((e: unknown) => e)
    expect((error as RetryableError).details.retryAfterMs).toBe(3_000)
  })
})

describe('hubspotOAuth', () => {
  it('asks for contact, deal and deal-schema scopes', () => {
    const url = new URL(hubspotOAuth.authorizeUrl({ config, state: 's', redirectUri: 'https://x.test/cb' }))
    expect(url.origin).toBe('https://app.hubspot.com')
    expect(url.searchParams.get('scope')!.split(' ')).toEqual(expect.arrayContaining(['crm.objects.deals.write', 'crm.schemas.deals.write']))
  })

  it('exchanges the code, labels the account and prepares the deal properties', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'at', refresh_token: 'rt', expires_in: 1800 }))
      .mockResolvedValueOnce(json({ hub_id: 42, hub_domain: 'acme.hubspot.com' }))
      .mockResolvedValueOnce(json({}, 201))
      .mockResolvedValueOnce(json({ message: 'already exists' }, 409))
    vi.stubGlobal('fetch', fetchMock)

    const result = await hubspotOAuth.exchangeCode({ config, code: 'c', redirectUri: 'https://x.test/cb' })
    expect(result.credentials).toEqual({ access_token: 'at', refresh_token: 'rt' })
    expect(result.accountLabel).toBe('acme.hubspot.com')
    expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(4) // token, account, 2 properties (one already existed)
  })

  it('treats a rejected refresh token as permanent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ status: 'BAD_REFRESH_TOKEN' }, 400)))
    await expect(hubspotOAuth.refresh!({ config, credentials: { refresh_token: 'old' } })).rejects.toBeInstanceOf(PermanentError)
  })
})

describe('ensureDealProperties', () => {
  it('makes opshub_order_id unique, which is what makes deal upserts idempotent', () => {
    expect(DEAL_PROPERTIES.find(p => p.name === 'opshub_order_id')).toMatchObject({ hasUniqueValue: true })
  })

  it('fails on errors other than "already exists"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'missing scope' }, 403)))
    await expect(ensureDealProperties('t')).rejects.toBeInstanceOf(PermanentError)
  })
})

describe('sync_deal', () => {
  const ORG = 'org-1'
  const order = { id: 'order-1', org_id: ORG, status: 'paid', amount_cents: 2900, currency: 'usd', customer_id: 'cust-1', customers: { id: 'cust-1', email: 'ben@example.com', name: 'Ben Okafor' } }

  function ctx() {
    const updates: Record<string, unknown>[] = []
    const query = {
      select: () => query,
      eq: () => query,
      update: (values: Record<string, unknown>) => {
        updates.push(values)
        return { eq: async () => ({ error: null }) }
      },
      maybeSingle: async () => ({ data: table === 'orders' ? order : { id: 'conn-1', status: 'connected', metadata: {}, token_expires_at: new Date(Date.now() + 3_600_000).toISOString() }, error: null }),
    }
    let table = ''
    const db = {
      from: (t: string) => {
        table = t
        return query
      },
      rpc: async () => ({ data: JSON.stringify({ access_token: 'at', refresh_token: 'rt' }), error: null }),
    }
    return { context: { db, config, event: { id: 'evt-1', org_id: ORG } } as unknown as ActionContext, updates }
  }

  it('upserts contact and deal, associates them, and stores both ids', async () => {
    const calls: { method: string, url: string, body: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: init.method!, url, body: init.body ? JSON.parse(String(init.body)) : null })
      if (url.includes('contacts/batch/upsert')) return json({ results: [{ id: '101' }] })
      if (url.includes('deals/batch/upsert')) return json({ results: [{ id: '202' }] })
      return json({})
    }))

    const { context, updates } = ctx()
    const integration = { id: 'hubspot', displayName: 'HubSpot', oauth: hubspotOAuth } as Integration
    const result = await syncDeal(() => integration)(context, { orderId: '00000000-0000-4000-8000-000000000001' })

    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'POST /crm/v3/objects/contacts/batch/upsert',
      'POST /crm/v3/objects/deals/batch/upsert',
      'PUT /crm/v4/objects/deals/202/associations/default/contacts/101',
    ])
    expect((calls[1]!.body as { inputs: { idProperty: string }[] }).inputs[0]!.idProperty).toBe('opshub_order_id')
    expect(updates).toEqual([{ hubspot_contact_id: '101' }, { hubspot_deal_id: '202' }])
    expect(result.response).toMatchObject({ deal_id: '202', deal_stage: 'closedwon' })
  })

  it('refuses orders from another org', async () => {
    const { context } = ctx()
    context.event.org_id = 'someone-else'
    await expect(syncDeal(() => ({}) as Integration)(context, { orderId: '00000000-0000-4000-8000-000000000001' })).rejects.toThrow(/not found/)
  })
})
