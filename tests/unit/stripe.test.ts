import { describe, expect, it } from 'vitest'
import type { RuntimeConfig } from 'nuxt/schema'
import { stripeRequest, toForm } from '../../server/integrations/stripe/api'
import { orderTotal, randomOrder } from '../../server/integrations/stripe/catalog'
import { parseLineItems } from '../../server/integrations/stripe/schemas'
import { signStripePayload, verifyStripeSignature } from '../../server/integrations/stripe/signature'
import { verify } from '../../server/integrations/stripe/webhook'
import { PermanentError } from '../../server/lib/errors'

// Built at runtime so no file contains a real-looking secret.
const SECRET = 'whsec' + '_' + 'unit'.repeat(8)
const NOW = Date.parse('2026-11-09T12:00:00Z')
const T = Math.floor(NOW / 1000)
const ORG = '4b0e2f2a-1c4d-4a7e-9a39-7d1b6c2f8e11'

const body = JSON.stringify({
  id: 'evt_123',
  object: 'event',
  type: 'payment_intent.succeeded',
  livemode: false,
  data: { object: { id: 'pi_123', object: 'payment_intent', metadata: { org_id: ORG } } },
})
const sign = (payload = body, t = T, secret = SECRET) => `t=${t},v1=${signStripePayload(payload, t, secret)}`

describe('verifyStripeSignature', () => {
  const check = (header: string | undefined, payload = body) => () =>
    verifyStripeSignature(payload, header, SECRET, { now: NOW })

  it('accepts a valid signature', () => {
    expect(check(sign())).not.toThrow()
  })

  it('accepts when any one of several v1 signatures matches (secret rotation)', () => {
    expect(check(`t=${T},v1=${'0'.repeat(64)},v1=${signStripePayload(body, T, SECRET)}`)).not.toThrow()
  })

  it('rejects a tampered body', () => {
    expect(check(sign(), body.replace('pi_123', 'pi_999'))).toThrow(/does not match/)
  })

  it('rejects a signature made with another secret', () => {
    expect(check(sign(body, T, `${SECRET}x`))).toThrow(/does not match/)
  })

  it('rejects a replay outside the 5-minute window', () => {
    expect(check(sign(body, T - 301))).toThrow(/tolerance/)
  })

  it.each([
    [undefined, /Missing/],
    ['garbage', /Malformed/],
    [`t=${T}`, /Malformed/],
    [`t=abc,v1=${'a'.repeat(64)}`, /Malformed/],
  ])('rejects header %s', (header, message) => {
    expect(check(header)).toThrow(message)
  })

  it('refuses to verify when no secret is configured', () => {
    expect(() => verifyStripeSignature(body, sign(), '', { now: NOW })).toThrow(/not configured/)
  })
})

describe('verify (webhook)', () => {
  const config = { stripeWebhookSecret: SECRET } as RuntimeConfig

  it('extracts id, type and org from a genuine event', () => {
    // verify() uses the real clock, so sign with the current time.
    const t = Math.floor(Date.now() / 1000)
    const result = verify({ body, headers: { 'stripe-signature': sign(body, t) } }, config)
    expect(result).toMatchObject({ externalId: 'evt_123', type: 'payment_intent.succeeded', orgId: ORG })
  })

  it('rejects live-mode events (test mode only)', () => {
    const t = Math.floor(Date.now() / 1000)
    const live = body.replace('"livemode":false', '"livemode":true')
    expect(() => verify({ body: live, headers: { 'stripe-signature': sign(live, t) } }, config)).toThrow(/Live-mode/)
  })

  it('keeps only id and type for event types OpsHub does not use (no personal data)', () => {
    const t = Math.floor(Date.now() / 1000)
    const charge = JSON.stringify({
      id: 'evt_ch', object: 'event', type: 'charge.succeeded', livemode: false,
      data: { object: { id: 'ch_1', billing_details: { email: 'real.person@gmail.com', address: { line1: '1 Real St' } }, metadata: { org_id: ORG } } },
    })
    const result = verify({ body: charge, headers: { 'stripe-signature': sign(charge, t) } }, config)
    expect(JSON.stringify(result.payload)).not.toContain('real.person')
    expect(result.payload).toMatchObject({ id: 'evt_ch', type: 'charge.succeeded' })
  })

  it('treats a non-uuid org_id as unknown rather than trusting it', () => {
    const t = Math.floor(Date.now() / 1000)
    const evil = body.replace(ORG, '\'; drop table orders; --')
    const result = verify({ body: evil, headers: { 'stripe-signature': sign(evil, t) } }, config)
    expect(result.orgId).toBeNull()
  })
})

describe('toForm', () => {
  it('encodes nested objects and arrays the way Stripe expects', () => {
    const form = toForm({
      amount: 1800,
      confirm: true,
      metadata: { org_id: 'o1' },
      line_items: [{ quantity: 1, price_data: { currency: 'usd' } }],
      skipped: undefined,
    })
    expect([...form.entries()]).toEqual([
      ['amount', '1800'],
      ['confirm', 'true'],
      ['metadata[org_id]', 'o1'],
      ['line_items[0][quantity]', '1'],
      ['line_items[0][price_data][currency]', 'usd'],
    ])
  })
})

describe('stripeRequest', () => {
  it('refuses live keys before making any request', async () => {
    await expect(stripeRequest({ secretKey: 'sk_' + 'live_' + 'x'.repeat(24), method: 'GET', path: '/charges' }))
      .rejects.toBeInstanceOf(PermanentError)
  })

  it('fails clearly when Stripe is not configured', async () => {
    await expect(stripeRequest({ secretKey: '', method: 'GET', path: '/charges' })).rejects.toThrow(/not configured/)
  })
})

describe('catalog', () => {
  it('builds a valid random order with a reserved example.com email', () => {
    for (let i = 0; i < 50; i++) {
      const { items, customer } = randomOrder()
      expect(items.length).toBeGreaterThanOrEqual(1)
      expect(items.length).toBeLessThanOrEqual(3)
      expect(customer.email).toMatch(/@example\.com$/)
      expect(orderTotal(items)).toBeGreaterThan(0)
    }
  })

  it('parses line items from metadata, and survives junk', () => {
    expect(parseLineItems('[{"name":"Mug","quantity":2,"unit_amount":1800}]')).toEqual([{ name: 'Mug', quantity: 2, unit_amount: 1800 }])
    expect(parseLineItems('not json')).toEqual([])
    expect(parseLineItems('[{"name":"Mug"}]')).toEqual([])
    expect(parseLineItems(undefined)).toEqual([])
  })
})
