import { afterEach, describe, expect, it, vi } from 'vitest'
import { discord } from '../../server/integrations/discord'
import { buildOrderEmbed, escapeMarkdown, isDiscordWebhookUrl } from '../../server/integrations/discord/message'
import { PermanentError } from '../../server/lib/errors'

afterEach(() => vi.unstubAllGlobals())
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const HOOK = 'https://discord.com/api/webhooks/123456789/abc-DEF_123'

describe('isDiscordWebhookUrl', () => {
  it.each([
    [HOOK, true],
    ['https://discordapp.com/api/webhooks/1/x', true],
    ['http://discord.com/api/webhooks/1/x', false],
    ['https://discord.com.evil.test/api/webhooks/1/x', false],
    ['https://evil.test/api/webhooks/1/x', false],
    ['https://discord.com/api/webhooks/not-a-number/x', false],
    ['https://discord.com/api/channels/1/messages', false],
    ['nope', false],
  ])('%s → %s', (url, expected) => {
    expect(isDiscordWebhookUrl(url)).toBe(expected)
  })
})

describe('buildOrderEmbed', () => {
  const order = { id: 'o1', status: 'delivered' as const, amountCents: 2900, currency: 'usd', customerName: 'Ben Okafor', carrier: 'USPS', trackingCode: 'EZ4000000004' }

  it('never allows mentions, whatever the customer name contains', () => {
    const body = buildOrderEmbed({ ...order, customerName: '@everyone <@&123>' }, 'https://x.test')
    expect(body.allowed_mentions).toEqual({ parse: [] })
  })

  it('escapes markdown, including masked links', () => {
    expect(escapeMarkdown('[Refund here](https://evil.test)')).toBe('\\[Refund here\\]\\(https://evil.test\\)')
    expect(buildOrderEmbed({ ...order, customerName: '**bold**' }, 'https://x.test').embeds[0]!.description).toContain('\\*\\*bold\\*\\*')
  })

  it('links back to the order', () => {
    expect(buildOrderEmbed(order, 'https://opshub.example/').embeds[0]!.url).toBe('https://opshub.example/orders/o1')
  })
})

describe('discord.manualConnect', () => {
  it('verifies the webhook exists and stores only the URL as the secret', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ name: 'OpsHub', channel_id: '42' })))
    const result = await discord.manualConnect!.connect(HOOK)
    expect(result).toMatchObject({ credentials: { webhook_url: HOOK }, accountLabel: 'OpsHub webhook', metadata: { channel_id: '42' } })
    expect(JSON.stringify(result.metadata)).not.toContain('webhooks')
  })

  it('stores the canonical URL, dropping a pasted query string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ name: 'OpsHub', channel_id: '42' })))
    const result = await discord.manualConnect!.connect(`${HOOK}?thread_id=999#x`)
    expect(result.credentials).toEqual({ webhook_url: HOOK })
  })

  it('rejects non-Discord URLs before making any request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(discord.manualConnect!.connect('https://evil.test/hook')).rejects.toBeInstanceOf(PermanentError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a webhook Discord doesn\'t know', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'Unknown Webhook', code: 10015 }, 404)))
    await expect(discord.manualConnect!.connect(HOOK)).rejects.toBeInstanceOf(PermanentError)
  })
})
