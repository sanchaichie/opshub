import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/shared/types/database.types'

/**
 * Health check + keep-alive.
 *
 * - Anyone: read-only status, so uptime monitors and the dashboard footer can
 *   show when each keep-alive pinger last ran.
 * - Vercel Cron (Bearer CRON_SECRET): also records a heartbeat, which is the
 *   real database write that keeps the free Supabase project from pausing.
 */
export default defineEventHandler(async (event) => {
  const db = serverSupabaseServiceRole<Database>(event)
  const write = isCronRequest(event)

  const { data, error } = write
    ? await db.rpc('heartbeat', { pinger: 'vercel-cron' })
    : await db.rpc('heartbeat_status')

  if (error) {
    // Don't leak database error details on a public endpoint.
    console.error('[health] database check failed', error)
    setResponseStatus(event, 503)
    return { status: 'degraded', db: 'error' } as const
  }

  return {
    status: 'ok',
    db: 'ok',
    recorded: write,
    heartbeats: data.map(h => ({ source: h.source, lastSeen: h.last_seen, beats: h.beats })),
  } as const
})
