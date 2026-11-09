import { parseRetryAfter } from './backoff'
import { PermanentError, RetryableError } from './errors'

/**
 * The one way integrations call external APIs.
 *
 * - Every request has a timeout (a hung provider must not hang the worker).
 * - Failures are classified once, here: 408/425/429/5xx and network errors
 *   are retryable; other 4xx are permanent. 429/503 carry Retry-After.
 * - Responses are parsed as JSON when possible, so actions get typed data and
 *   the event log gets something readable.
 */

export interface HttpRequest {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  /** Objects are sent as JSON; strings and URLSearchParams as-is. */
  body?: unknown
  timeoutMs?: number
  /** Sent as `Idempotency-Key` for providers that support it (Stripe, EasyPost). */
  idempotencyKey?: string
}

export interface HttpResponse<T = unknown> {
  status: number
  headers: Headers
  data: T
  durationMs: number
}

const DEFAULT_TIMEOUT_MS = 10_000
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

export async function httpRequest<T = unknown>(request: HttpRequest, fetchImpl: typeof fetch = fetch): Promise<HttpResponse<T>> {
  const { url, method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS, idempotencyKey } = request

  const finalHeaders: Record<string, string> = { accept: 'application/json', ...headers }
  if (idempotencyKey) finalHeaders['idempotency-key'] = idempotencyKey

  let payload: BodyInit | undefined
  if (typeof body === 'string' || body instanceof URLSearchParams) {
    payload = body
  }
  else if (body !== undefined) {
    payload = JSON.stringify(body)
    finalHeaders['content-type'] ??= 'application/json'
  }

  const started = Date.now()
  let res: Response
  try {
    res = await fetchImpl(url, { method, headers: finalHeaders, body: payload, signal: AbortSignal.timeout(timeoutMs) })
  }
  catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new RetryableError(timedOut ? `Timed out after ${timeoutMs}ms: ${method} ${hostOf(url)}` : `Network error: ${method} ${hostOf(url)}`)
  }

  const data = await parseBody(res)
  const durationMs = Date.now() - started

  if (res.ok) return { status: res.status, headers: res.headers, data: data as T, durationMs }

  const message = `${method} ${hostOf(url)} responded ${res.status}`
  if (RETRYABLE_STATUS.has(res.status)) {
    throw new RetryableError(message, {
      httpStatus: res.status,
      retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
      response: data,
    })
  }
  throw new PermanentError(message, { httpStatus: res.status, response: data })
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

/** Error messages name the host, never the full URL (which may carry tokens). */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  }
  catch {
    return 'unknown-host'
  }
}
