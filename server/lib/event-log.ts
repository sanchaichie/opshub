import type { Json } from '../../shared/types/database.types'
import type { ServiceClient } from '../integrations/types'
import { redact } from './redact'

const asJson = (value: unknown) => redact(value) as Json

/**
 * Logs a call that had to happen synchronously inside a user request (e.g.
 * creating a Checkout session, where the browser needs the URL right away).
 * It isn't queued, but it still appears in the inspector with its attempt.
 */
export async function recordSyncCall(
  db: ServiceClient,
  call: {
    orgId: string
    /** Shows the call in that order's "Integration events". Must belong to orgId. */
    orderId?: string | null
    provider: string
    action: string
    idempotencyKey: string
    input: unknown
    startedAt: Date
    outcome: { ok: true, httpStatus: number, response: unknown } | { ok: false, error: string, httpStatus?: number | null, response?: unknown }
  },
): Promise<void> {
  const { outcome } = call
  const httpStatus = outcome.httpStatus ?? null
  const response = asJson(outcome.response ?? null)

  const { data, error } = await db
    .from('events')
    .insert({
      org_id: call.orgId,
      direction: 'outbound',
      provider: call.provider,
      type: call.action,
      idempotency_key: call.idempotencyKey,
      order_id: call.orderId ?? null,
      status: outcome.ok ? 'succeeded' : 'dead',
      request: asJson({ input: call.input }),
      response,
      http_status: httpStatus,
      error: outcome.ok ? null : outcome.error,
      attempts: 1,
      max_attempts: 1,
      processed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw error

  const { error: attemptError } = await db.from('event_attempts').insert({
    event_id: data.id,
    org_id: call.orgId,
    attempt_no: 1,
    started_at: call.startedAt.toISOString(),
    duration_ms: Date.now() - call.startedAt.getTime(),
    http_status: httpStatus,
    error: outcome.ok ? null : outcome.error,
    response,
  })
  if (attemptError) throw attemptError
}
