import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeConfig } from 'nuxt/schema'
import { bookCall, sendFollowUp } from '../../server/integrations/google/actions'
import { callEvent, CALL_MINUTES, eventIdFor, isMeetLink } from '../../server/integrations/google/calendar'
import { buildRawMessage, followUpEmail, recipientFor } from '../../server/integrations/google/mail'
import { googleOAuth } from '../../server/integrations/google/oauth'
import type { ActionContext, Integration } from '../../server/integrations/types'
import { PermanentError } from '../../server/lib/errors'

const config = { googleClientId: 'cid', googleClientSecret: 'cs', demoEmailAllowlist: 'owner@example.com, second@example.com', public: { siteUrl: 'https://opshub.example' } } as unknown as RuntimeConfig
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8')
afterEach(() => vi.unstubAllGlobals())

describe('googleOAuth', () => {
  it('asks for offline access with PKCE and only the scopes it needs', () => {
    const url = new URL(googleOAuth.authorizeUrl({ config, state: 's', redirectUri: 'https://x.test/cb', codeChallenge: 'ch' }))
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ access_type: 'offline', prompt: 'consent', code_challenge: 'ch', code_challenge_method: 'S256' })
    expect(url.searchParams.get('scope')!.split(' ').sort()).toEqual([
      'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/gmail.send', 'openid',
    ])
  })

  const grant = (scope: string, refresh = 'rt') => json({ access_token: 'at', expires_in: 3599, refresh_token: refresh || undefined, scope })
  const ALL = 'openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events'

  it('labels the connection with the Google account and keeps the refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(grant(ALL)).mockResolvedValueOnce(json({ email: 'shop@acme.test', sub: '123' })))
    const result = await googleOAuth.exchangeCode({ config, code: 'c', redirectUri: 'https://x.test/cb', codeVerifier: 'v' })
    expect(result).toMatchObject({ accountLabel: 'shop@acme.test', credentials: { access_token: 'at', refresh_token: 'rt' } })
  })

  it('refuses a connection where the user unticked a permission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(grant('openid email https://www.googleapis.com/auth/gmail.send')))
    await expect(googleOAuth.exchangeCode({ config, code: 'c', redirectUri: 'https://x.test/cb' })).rejects.toThrow(/Calendar/)
  })

  it('refuses a connection without a refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(grant(ALL, '')))
    await expect(googleOAuth.exchangeCode({ config, code: 'c', redirectUri: 'https://x.test/cb' })).rejects.toThrow(/refresh token/)
  })

  it('keeps the existing refresh token when Google does not send a new one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ access_token: 'new', expires_in: 3599 })))
    const result = await googleOAuth.refresh!({ config, credentials: { refresh_token: 'keep-me' } })
    expect(result.credentials).toEqual({ access_token: 'new', refresh_token: 'keep-me' })
  })
})

describe('buildRawMessage', () => {
  it('builds a multipart message with both parts', () => {
    const raw = decode(buildRawMessage({ to: 'a@example.com', subject: 'Hello', text: 'plain', html: '<p>html</p>' }))
    expect(raw).toContain('To: a@example.com\r\n')
    expect(raw).toContain('Content-Type: text/plain')
    expect(raw).toContain('Content-Type: text/html')
  })

  it('cannot be header-injected through the subject', () => {
    const raw = decode(buildRawMessage({ to: 'a@example.com', subject: 'Hi\r\nBcc: attacker@evil.test', text: 't', html: 'h' }))
    expect(raw.split('\r\n').some(line => line.startsWith('Bcc:'))).toBe(false)
  })

  it('rejects a recipient carrying extra headers or addresses', () => {
    expect(() => buildRawMessage({ to: 'a@example.com\r\nBcc: x@evil.test', subject: 's', text: 't', html: 'h' })).toThrow(PermanentError)
    expect(() => buildRawMessage({ to: 'a@example.com, b@example.com', subject: 's', text: 't', html: 'h' })).toThrow(PermanentError)
  })

  it('encodes non-ASCII subjects (RFC 2047)', () => {
    expect(decode(buildRawMessage({ to: 'a@example.com', subject: 'Café ☕', text: 't', html: 'h' }))).toContain('Subject: =?UTF-8?B?')
  })
})

describe('recipientFor', () => {
  it('sends to the customer for real orgs', () => {
    expect(recipientFor('ben@example.com', false, '')).toBe('ben@example.com')
  })

  it('always uses the allowlisted inbox in the demo, never the customer', () => {
    expect(recipientFor('visitor@gmail.com', true, ' owner@example.com , second@example.com')).toBe('owner@example.com')
  })

  it('refuses demo sends when no allowlist is configured', () => {
    expect(() => recipientFor('x@example.com', true, '')).toThrow(/ALLOWLIST/)
  })
})

describe('followUpEmail', () => {
  it('escapes customer-controlled text in the HTML part', () => {
    const email = followUpEmail({ customerName: '<script>x</script>', orgName: 'Acme', items: [{ name: '<b>Mug</b>', quantity: 1 }] })
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;b&gt;Mug&lt;/b&gt;')
  })
})

describe('calendar', () => {
  it('derives a valid, deterministic Calendar event id', () => {
    const id = eventIdFor('order-1', '2026-11-20T10:00:00.000Z')
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/)
    expect(eventIdFor('order-1', '2026-11-20T10:00:00.000Z')).toBe(id)
    expect(eventIdFor('order-1', '2026-11-20T11:00:00.000Z')).not.toBe(id)
  })

  it('builds a 30-minute event with a Meet request keyed on the event id', () => {
    const event = callEvent({ eventId: 'abc12', startsAt: '2026-11-20T10:00:00Z', attendee: 'a@example.com', customerName: 'Ben', orgName: 'Acme', orderUrl: 'https://x/orders/1' })
    expect(new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()).toBe(CALL_MINUTES * 60_000)
    expect(event.conferenceData.createRequest.requestId).toBe('abc12')
  })

  it.each([
    ['https://meet.google.com/abc-defg-hij', true],
    ['https://meet.google.com.evil.test/x', false],
    ['javascript:alert(1)', false],
    [null, false],
  ])('isMeetLink(%s) → %s', (url, expected) => {
    expect(isMeetLink(url)).toBe(expected)
  })
})

describe('actions', () => {
  let budgetLeft = true
  function ctx(isDemo: boolean) {
    const order = { id: 'order-1', org_id: 'org-1', status: 'delivered', line_items: [{ name: 'Mug', quantity: 2 }], customers: { name: 'Ben Okafor', email: 'ben@example.com' }, organizations: { name: 'Acme', is_demo: isDemo } }
    let table = ''
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: table === 'orders' ? order : { id: 'conn', status: 'connected', metadata: {}, token_expires_at: new Date(Date.now() + 3_600_000).toISOString() }, error: null }),
    }
    const db = {
      from: (t: string) => {
        table = t
        return query
      },
      rpc: (fn: string) => {
        // bump_usage is awaited via .single(); the Vault read is awaited directly.
        const result = fn === 'bump_usage'
          ? { data: { allowed: budgetLeft }, error: null }
          : { data: JSON.stringify({ access_token: 'at', refresh_token: 'rt' }), error: null }
        return Object.assign(Promise.resolve(result), { single: async () => result })
      },
    }
    return { db, config, event: { id: 'evt', org_id: 'org-1' } } as unknown as ActionContext
  }
  const google = () => ({ id: 'google', displayName: 'Google', oauth: googleOAuth }) as Integration

  it('demo follow-ups go to the allowlisted inbox, not the customer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 'msg-1' }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendFollowUp(google)(ctx(true), { orderId: '00000000-0000-4000-8000-000000000001' })
    const raw = decode(JSON.parse(String(fetchMock.mock.calls[0]![1].body)).raw)
    expect(raw).toContain('To: owner@example.com')
    expect(raw).not.toContain('ben@example.com')
    expect(result.response).toMatchObject({ message_id: 'msg-1', demo_redirected: true })
  })

  it('stops demo sends once the shared hourly budget is used up', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    budgetLeft = false
    const result = await sendFollowUp(google)(ctx(true), { orderId: '00000000-0000-4000-8000-000000000001' })
    budgetLeft = true
    expect(result.status).toBe('ignored')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a retried booking (409: already exists) returns the existing event', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: { message: 'The requested identifier already exists.' } }, 409))
      .mockResolvedValueOnce(json({ id: 'evt', hangoutLink: 'https://meet.google.com/abc-defg-hij' }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await bookCall(google)(ctx(false), { orderId: '00000000-0000-4000-8000-000000000001', startsAt: '2026-11-20T10:00:00Z' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/events/opshub')
    expect(result.response).toMatchObject({ meet_link: 'https://meet.google.com/abc-defg-hij' })
  })
})
