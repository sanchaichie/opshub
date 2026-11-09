import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeConfig } from 'nuxt/schema'
import { buildOrderMessage, isSlackWebhookUrl, NOTIFY_ON } from '../../server/integrations/slack/message'
import { slackOAuth } from '../../server/integrations/slack/oauth'
import { PermanentError } from '../../server/lib/errors'

const order = {
  id: '4b0e2f2a-1c4d-4a7e-9a39-7d1b6c2f8e11',
  status: 'delivered' as const,
  amountCents: 3600,
  currency: 'usd',
  customerName: 'Ava Silva',
  carrier: 'USPS',
  trackingCode: 'EZ4000000004',
}

describe('buildOrderMessage', () => {
  it('summarizes the order with a link back to OpsHub', () => {
    const msg = buildOrderMessage(order, 'https://opshub.example/')
    expect(msg.text).toBe('Order delivered: Ava Silva ($36.00)')
    expect(JSON.stringify(msg.blocks)).toContain('https://opshub.example/orders/4b0e2f2a-1c4d-4a7e-9a39-7d1b6c2f8e11')
    expect(JSON.stringify(msg.blocks)).toContain('USPS EZ4000000004')
  })

  it('escapes Slack control characters in customer data', () => {
    const msg = buildOrderMessage({ ...order, customerName: '<!channel> & co' }, 'https://x.test')
    expect(msg.text).toContain('&lt;!channel&gt; &amp; co')
    expect(JSON.stringify(msg.blocks)).not.toContain('<!channel>')
  })

  it('stops formatting tricks and over-long names', () => {
    const msg = buildOrderMessage({ ...order, customerName: `*Refund* at evil.example ${'x'.repeat(500)}` }, 'https://x.test')
    expect(msg.text).not.toContain('*Refund*')
    expect(msg.text.length).toBeLessThan(200)
    expect(msg.blocks.filter(b => 'text' in b).every(b => (b as { text: { verbatim?: boolean } }).text.verbatim)).toBe(true)
  })

  it('handles orders without tracking', () => {
    expect(JSON.stringify(buildOrderMessage({ ...order, status: 'stuck', trackingCode: null }, 'https://x.test').blocks)).toContain('Tracking: not yet')
  })
})

describe('NOTIFY_ON', () => {
  it('notifies on shipping milestones and problems only', () => {
    expect([...NOTIFY_ON].sort()).toEqual(['delivered', 'exception', 'in_transit', 'stuck'])
  })
})

describe('isSlackWebhookUrl', () => {
  it.each([
    ['https://hooks.slack.com/services/T0/B0/xyz', true],
    ['http://hooks.slack.com/services/T0/B0/xyz', false],
    ['https://hooks.slack.com.evil.test/services/x', false],
    ['https://evil.test/hooks.slack.com/services/x', false],
    ['https://hooks.slack.com/other', false],
    ['not a url', false],
    [undefined, false],
  ])('%s → %s', (url, expected) => {
    expect(isSlackWebhookUrl(url)).toBe(expected)
  })
})

describe('slackOAuth', () => {
  const config = { slackClientId: 'cid', slackClientSecret: 'csecret' } as RuntimeConfig
  afterEach(() => vi.unstubAllGlobals())
  const slackReplies = (body: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })))

  it('builds the authorize URL with the incoming-webhook scope and state', () => {
    const url = new URL(slackOAuth.authorizeUrl({ config, state: 's1', redirectUri: 'https://x.test/api/oauth/slack/callback' }))
    expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: 'cid', scope: 'incoming-webhook', state: 's1' })
  })

  it('maps a successful exchange; the webhook URL goes to credentials only', async () => {
    slackReplies({
      ok: true, access_token: 'tok', scope: 'incoming-webhook', team: { id: 'T1', name: 'Acme' },
      incoming_webhook: { url: 'https://hooks.slack.com/services/T1/B1/abc', channel: '#orders', channel_id: 'C1' },
    })
    const result = await slackOAuth.exchangeCode({ config, code: 'c', redirectUri: 'https://x.test/cb' })
    expect(result.accountLabel).toBe('#orders in Acme')
    // Only what posting needs: the unused access token isn't stored.
    expect(result.credentials).toEqual({ webhook_url: 'https://hooks.slack.com/services/T1/B1/abc' })
    expect(JSON.stringify(result.metadata)).not.toContain('hooks.slack.com')
  })

  it('treats Slack\'s 200 + ok:false as a failure', async () => {
    slackReplies({ ok: false, error: 'invalid_code' })
    await expect(slackOAuth.exchangeCode({ config, code: 'c', redirectUri: 'https://x.test/cb' })).rejects.toThrow(/invalid_code/)
  })

  it('refuses a webhook URL that is not Slack\'s', async () => {
    slackReplies({
      ok: true, access_token: 'tok', team: { id: 'T1', name: 'Acme' },
      incoming_webhook: { url: 'https://evil.test/collect', channel: '#x', channel_id: 'C1' },
    })
    await expect(slackOAuth.exchangeCode({ config, code: 'c', redirectUri: 'https://x.test/cb' })).rejects.toBeInstanceOf(PermanentError)
  })

  it('reports whether the app keys are configured', () => {
    expect(slackOAuth.isConfigured(config)).toBe(true)
    expect(slackOAuth.isConfigured({ slackClientId: '', slackClientSecret: '' } as RuntimeConfig)).toBe(false)
  })
})
