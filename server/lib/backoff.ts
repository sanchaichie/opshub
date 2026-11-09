/**
 * Retry timing for failed events.
 *
 * Exponential backoff with "equal jitter": the delay doubles each attempt and
 * half of it is randomized, so many events that fail together (a provider
 * outage) don't all retry in the same second. A provider's Retry-After always
 * wins when it asks for longer.
 */

export interface BackoffOptions {
  baseMs?: number
  maxMs?: number
  /** From a 429/503 Retry-After header, already parsed. */
  retryAfterMs?: number
  /** Injectable for tests. */
  random?: () => number
}

export const DEFAULT_BASE_MS = 10_000 // 10s, 20s, 40s, 80s, …
export const DEFAULT_MAX_MS = 60 * 60_000 // never wait more than an hour

/** Delay before the next try, given how many attempts have already been made (≥ 1). */
export function retryDelayMs(attemptsMade: number, options: BackoffOptions = {}): number {
  const { baseMs = DEFAULT_BASE_MS, maxMs = DEFAULT_MAX_MS, retryAfterMs, random = Math.random } = options

  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attemptsMade - 1))
  const jittered = exponential / 2 + random() * (exponential / 2)

  const delay = retryAfterMs !== undefined ? Math.max(jittered, retryAfterMs) : jittered
  return Math.round(Math.min(delay, maxMs))
}

/**
 * Parses a Retry-After header: either delay-seconds ("120") or an HTTP date.
 * Returns undefined for missing or nonsensical values so callers fall back
 * to normal backoff.
 */
export function parseRetryAfter(header: string | null | undefined, now: number = Date.now()): number | undefined {
  if (!header) return undefined
  const value = header.trim()

  if (/^\d+$/.test(value)) return Number(value) * 1000

  // Only accept something shaped like an HTTP date ("Wed, 21 Oct 2015 07:28:00 GMT").
  // Date.parse alone is far too lenient: it reads "-5" as the year -5.
  if (!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) return undefined
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - now)
}
