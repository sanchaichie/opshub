import { describe, expect, it } from 'vitest'
import type { RuntimeConfig } from 'nuxt/schema'
import { journeyFor, TEST_JOURNEYS } from '../../server/integrations/easypost/actions'
import { easypostRequest } from '../../server/integrations/easypost/api'
import { cheapestRate, type Shipment } from '../../server/integrations/easypost/schemas'
import { signEasyPostPayload, verifyEasyPostSignature } from '../../server/integrations/easypost/signature'
import { nextOrderStatus, TRACKER_STATUSES, type OrderStatus } from '../../server/integrations/easypost/status'
import { verify } from '../../server/integrations/easypost/webhook'
import { PermanentError } from '../../server/lib/errors'

const SECRET = 'easypost-test-' + 'secret'.repeat(4)
const body = JSON.stringify({
  id: 'evt_1', object: 'Event', description: 'tracker.updated', mode: 'test',
  result: { id: 'trk_1', object: 'Tracker', tracking_code: 'EZ4000000004', status: 'delivered', shipment_id: 'shp_1' },
})
const header = (payload = body, secret = SECRET) => `hmac-sha256-hex=${signEasyPostPayload(payload, secret)}`
const config = { easypostWebhookSecret: SECRET } as RuntimeConfig

describe('verifyEasyPostSignature', () => {
  it('accepts a valid signature', () => {
    expect(() => verifyEasyPostSignature(body, header(), SECRET)).not.toThrow()
  })

  it('rejects a tampered body', () => {
    expect(() => verifyEasyPostSignature(body.replace('delivered', 'failure'), header(), SECRET)).toThrow(/does not match/)
  })

  it('rejects another secret', () => {
    expect(() => verifyEasyPostSignature(body, header(body, `${SECRET}x`), SECRET)).toThrow(/does not match/)
  })

  it.each([undefined, '', 'sha256=abc', 'hmac-sha256-hex=zz'])('rejects header %s', (value) => {
    expect(() => verifyEasyPostSignature(body, value, SECRET)).toThrow()
  })

  it('refuses when no secret is configured', () => {
    expect(() => verifyEasyPostSignature(body, header(), '')).toThrow(/not configured/)
  })
})

describe('verify (webhook)', () => {
  it('extracts the event and leaves the org to resolveOrgId', () => {
    expect(verify({ body, headers: { 'x-hmac-signature': header() } }, config))
      .toMatchObject({ externalId: 'evt_1', type: 'tracker.updated', orgId: null })
  })

  it('rejects production-mode events', () => {
    const prod = body.replace('"mode":"test"', '"mode":"production"')
    expect(() => verify({ body: prod, headers: { 'x-hmac-signature': header(prod) } }, config)).toThrow(/Production/)
  })

  it('keeps no payload for event types OpsHub does not use', () => {
    const other = JSON.stringify({ id: 'evt_2', object: 'Event', description: 'batch.created', mode: 'test', result: { secret_stuff: 'x' } })
    const result = verify({ body: other, headers: { 'x-hmac-signature': header(other) } }, config)
    expect(JSON.stringify(result.payload)).not.toContain('secret_stuff')
  })
})

describe('nextOrderStatus', () => {
  it.each<[OrderStatus, string, OrderStatus | null]>([
    ['label_created', 'in_transit', 'in_transit'],
    ['in_transit', 'out_for_delivery', 'out_for_delivery'],
    ['out_for_delivery', 'delivered', 'delivered'],
    ['label_created', 'delivered', 'delivered'], // skipping steps is fine
    ['in_transit', 'available_for_pickup', 'out_for_delivery'],
    ['in_transit', 'return_to_sender', 'exception'],
    ['out_for_delivery', 'failure', 'exception'],
  ])('%s + %s → %s', (current, tracker, expected) => {
    expect(nextOrderStatus(current, tracker)).toBe(expected)
  })

  it('never moves backwards on a late update', () => {
    expect(nextOrderStatus('out_for_delivery', 'in_transit')).toBeNull()
    expect(nextOrderStatus('in_transit', 'pre_transit')).toBeNull()
  })

  it('treats delivered and cancelled as final', () => {
    for (const s of TRACKER_STATUSES) {
      expect(nextOrderStatus('delivered', s)).toBeNull()
      expect(nextOrderStatus('cancelled', s)).toBeNull()
    }
  })

  it('un-sticks an order when it starts moving again', () => {
    expect(nextOrderStatus('stuck', 'in_transit')).toBe('in_transit')
    expect(nextOrderStatus('exception', 'delivered')).toBe('delivered')
  })

  it('does not send a stuck order back to label_created on a late pre_transit', () => {
    expect(nextOrderStatus('stuck', 'pre_transit')).toBeNull()
    expect(nextOrderStatus('exception', 'pre_transit')).toBeNull()
  })

  it('ignores unknown and unrecognized statuses', () => {
    expect(nextOrderStatus('in_transit', 'unknown')).toBeNull()
    expect(nextOrderStatus('in_transit', 'teleported')).toBeNull()
  })

  it('maps every documented EasyPost status without throwing', () => {
    for (const s of TRACKER_STATUSES) expect(() => nextOrderStatus('label_created', s)).not.toThrow()
  })
})

describe('journeyFor', () => {
  it('is deterministic per order, so retries pick the same journey', () => {
    const id = crypto.randomUUID()
    expect(journeyFor(id)).toEqual(journeyFor(id))
  })

  it('roughly follows the configured weights', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 4000; i++) {
      const j = journeyFor(crypto.randomUUID())
      counts.set(j.code, (counts.get(j.code) ?? 0) + 1)
    }
    for (const j of TEST_JOURNEYS) {
      expect((counts.get(j.code) ?? 0) / 4000).toBeCloseTo(j.weight / 100, 1)
    }
  })
})

describe('cheapestRate', () => {
  it('picks the lowest price, comparing numerically', () => {
    const shipment = { id: 'shp_1', rates: [
      { id: 'a', carrier: 'UPS', service: 'Ground', rate: '10.50', currency: 'USD' },
      { id: 'b', carrier: 'USPS', service: 'Priority', rate: '9.75', currency: 'USD' },
      { id: 'c', carrier: 'FedEx', service: 'Home', rate: '100.00', currency: 'USD' },
    ] } as Shipment
    expect(cheapestRate(shipment)?.id).toBe('b')
    expect(cheapestRate({ id: 'shp_2', rates: [] } as unknown as Shipment)).toBeNull()
  })
})

describe('easypostRequest', () => {
  it('refuses production keys before making a request', () => {
    expect(() => easypostRequest({ apiKey: 'EZ' + 'AK' + 'x'.repeat(30), method: 'GET', path: '/shipments' })).toThrow(PermanentError)
  })
})
