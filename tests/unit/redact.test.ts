import { describe, expect, it } from 'vitest'
import { REDACTED, redact, redactHeaders } from '../../server/lib/redact'

describe('redact', () => {
  it('masks sensitive keys at any depth, keeping the rest', () => {
    const input = {
      id: 'pi_123',
      client_secret: 'pi_123_secret_abc',
      customer: { email: 'a@b.test', api_key: 'k' },
      items: [{ access_token: 't', name: 'Mug' }],
      Authorization: 'Bearer x',
      refreshToken: 'r',
      password: 'p',
      webhook_url: 'https://hooks.slack.com/services/x',
    }
    expect(redact(input)).toEqual({
      id: 'pi_123',
      client_secret: REDACTED,
      customer: { email: 'a@b.test', api_key: REDACTED },
      items: [{ access_token: REDACTED, name: 'Mug' }],
      Authorization: REDACTED,
      refreshToken: REDACTED,
      password: REDACTED,
      webhook_url: REDACTED,
    })
  })

  it('does not mutate its input', () => {
    const input = { token: 'abc' }
    redact(input)
    expect(input.token).toBe('abc')
  })

  it('truncates huge strings', () => {
    const result = redact('x'.repeat(10_000)) as string
    expect(result.length).toBeLessThan(5_000)
    expect(result).toContain('TRUNCATED')
  })

  it('stops at a maximum depth instead of recursing forever', () => {
    let deep: Record<string, unknown> = { leaf: true }
    for (let i = 0; i < 50; i++) deep = { next: deep }
    expect(JSON.stringify(redact(deep))).toContain('TRUNCATED')
  })

  it('passes primitives through', () => {
    expect(redact(42)).toBe(42)
    expect(redact(null)).toBeNull()
    expect(redact(true)).toBe(true)
  })
})

describe('redactHeaders', () => {
  it('keeps only allowlisted headers, lower-cased', () => {
    expect(redactHeaders({
      'Content-Type': 'application/json',
      'Stripe-Signature': 't=1,v1=abc',
      'Authorization': 'Bearer x',
      'Cookie': 'sb=1',
      'Idempotency-Key': 'k1',
    })).toEqual({ 'content-type': 'application/json', 'idempotency-key': 'k1' })
  })

  it('accepts a Headers object', () => {
    const headers = new Headers({ 'retry-after': '5', 'x-api-key': 'k' })
    expect(redactHeaders(headers)).toEqual({ 'retry-after': '5' })
  })
})
