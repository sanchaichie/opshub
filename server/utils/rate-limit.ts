import type { H3Event } from 'h3'
import { useServiceClient } from './events'

export interface RateLimit {
  /** Stable name for the counter, e.g. `simulate:ip:<ip>` or `simulate:global`. */
  key: string
  max: number
  /** Postgres interval, e.g. '1 hour', '1 day'. */
  window: string
}

/**
 * Enforces each limit in order and throws a 429 (with Retry-After) on the
 * first one exceeded. Counters live in Postgres, so limits hold across every
 * serverless instance.
 */
export async function enforceRateLimits(event: H3Event, limits: RateLimit[], message = 'Too many requests'): Promise<void> {
  const db = useServiceClient(event)

  for (const limit of limits) {
    const { data, error } = await db
      .rpc('bump_usage', { counter_key: limit.key, window_size: limit.window, max_count: limit.max })
      .single()
    if (error) throw error

    if (!data.allowed) {
      const retryAfter = Math.max(1, Math.ceil((new Date(data.resets_at).getTime() - Date.now()) / 1000))
      setResponseHeader(event, 'Retry-After', retryAfter)
      throw createError({ statusCode: 429, statusMessage: message, data: { retryAfter } })
    }
  }
}

/** Client IP for rate limiting. Vercel sets x-forwarded-for; fall back to the socket. */
export function clientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
}
