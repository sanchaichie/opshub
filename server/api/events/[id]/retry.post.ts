import { z } from 'zod'

const params = z.object({ id: z.string().uuid() })

/**
 * The inspector's Retry button. Puts a failed or dead event back in the queue
 * immediately, allowing at least one more attempt, then runs the worker
 * after responding so the result shows up in the live feed within seconds.
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, params.parse)
  // Authenticate first, so signed-out callers can't probe which ids exist.
  await requireUserId(event)
  const db = useServiceClient(event)

  const { data: stored, error } = await db
    .from('events')
    .select('id, org_id, status, attempts, max_attempts')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  // Unknown id and "event in an org you can't see" look the same.
  if (!stored?.org_id) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  await requireOrgRole(event, stored.org_id)

  if (stored.status !== 'failed' && stored.status !== 'dead') {
    throw createError({ statusCode: 409, statusMessage: `Only failed or dead events can be retried (this one is ${stored.status})` })
  }

  const { data: updated, error: updateError } = await db
    .from('events')
    .update({
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
      max_attempts: Math.min(20, Math.max(stored.max_attempts, stored.attempts + 1)),
      locked_at: null,
    })
    .eq('id', id)
    // Guards against a double click racing the worker.
    .in('status', ['failed', 'dead'])
    .select('id, status')
    .maybeSingle()
  if (updateError) throw updateError
  if (!updated) throw createError({ statusCode: 409, statusMessage: 'The event changed while retrying; refresh and try again' })

  processSoon(event)
  return updated
})
