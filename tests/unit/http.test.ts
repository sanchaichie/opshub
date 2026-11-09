import { describe, expect, it, vi } from 'vitest'
import { PermanentError, RetryableError } from '../../server/lib/errors'
import { httpRequest } from '../../server/lib/http'

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
  )

describe('httpRequest', () => {
  it('returns parsed JSON on success', async () => {
    const res = await httpRequest<{ ok: boolean }>({ url: 'https://api.example.test/x' }, respond(200, { ok: true }))
    expect(res.status).toBe(200)
    expect(res.data).toEqual({ ok: true })
  })

  it('sends JSON bodies and the idempotency key', async () => {
    const fetchImpl = respond(200, {})
    await httpRequest({ url: 'https://api.example.test/x', method: 'POST', body: { a: 1 }, idempotencyKey: 'k1' }, fetchImpl)
    const [, init] = fetchImpl.mock.calls[0]!
    expect(init?.body).toBe('{"a":1}')
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json', 'idempotency-key': 'k1' })
  })

  it.each([408, 429, 500, 502, 503, 504])('treats %i as retryable', async (status) => {
    await expect(httpRequest({ url: 'https://api.example.test/x' }, respond(status, {}))).rejects.toBeInstanceOf(RetryableError)
  })

  it.each([400, 401, 403, 404, 422])('treats %i as permanent', async (status) => {
    await expect(httpRequest({ url: 'https://api.example.test/x' }, respond(status, {}))).rejects.toBeInstanceOf(PermanentError)
  })

  it('carries Retry-After and the response body on a 429', async () => {
    const error = await httpRequest({ url: 'https://api.example.test/x' }, respond(429, { message: 'slow down' }, { 'retry-after': '7' }))
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RetryableError)
    expect((error as RetryableError).details).toMatchObject({ httpStatus: 429, retryAfterMs: 7_000, response: { message: 'slow down' } })
  })

  it('treats network failures as retryable', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'))
    await expect(httpRequest({ url: 'https://api.example.test/x' }, fetchImpl)).rejects.toBeInstanceOf(RetryableError)
  })

  it('treats timeouts as retryable', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
    await expect(httpRequest({ url: 'https://api.example.test/x', timeoutMs: 5 }, fetchImpl)).rejects.toThrow(/Timed out after 5ms/)
  })

  it('never puts the full URL (which may hold tokens) in error messages', async () => {
    const error = await httpRequest({ url: 'https://api.example.test/hook?token=abc' }, respond(500, {})).catch((e: Error) => e)
    expect((error as Error).message).toContain('api.example.test')
    expect((error as Error).message).not.toContain('token=abc')
  })
})
