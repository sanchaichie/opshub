import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`.
 * Used by endpoints that schedulers call: Vercel Cron, pg_cron, GitHub Actions.
 * Compared in constant time so the secret can't be guessed byte by byte.
 */
export function isCronRequest(event: H3Event): boolean {
  const secret = useRuntimeConfig(event).cronSecret
  const header = getHeader(event, 'authorization') ?? ''
  if (!secret || !header.startsWith('Bearer ')) return false

  const given = Buffer.from(header.slice('Bearer '.length))
  const expected = Buffer.from(secret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
