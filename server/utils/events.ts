import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database, Json } from '~~/shared/types/database.types'
import type { EnqueueInput, ServiceClient, StoredEvent, VerifiedWebhook } from '../integrations/types'
import { redact, redactHeaders } from '../lib/redact'
import type { EventRepo } from '../lib/worker'

/**
 * Everything that writes to the event log goes through here, so redaction and
 * idempotency are applied in exactly one place.
 */

const UNIQUE_VIOLATION = '23505'

export function useServiceClient(event: H3Event): ServiceClient {
  return serverSupabaseServiceRole<Database>(event)
}

const asJson = (value: unknown) => redact(value) as Json

/**
 * Stores a verified inbound webhook. A provider retrying the same event hits the
 * unique (provider, external_id) constraint and we return the original row,
 * which makes webhook delivery idempotent no matter how often it's repeated.
 */
export async function recordInbound(
  db: ServiceClient,
  provider: string,
  webhook: VerifiedWebhook,
  headers: Record<string, string | undefined>,
): Promise<{ event: StoredEvent, duplicate: boolean }> {
  const { data, error } = await db
    .from('events')
    .insert({
      org_id: webhook.orgId,
      direction: 'inbound',
      provider,
      type: webhook.type,
      external_id: webhook.externalId,
      request: asJson({ headers: redactHeaders(headers), body: webhook.payload }),
    })
    .select()
    .single()

  if (!error) return { event: data, duplicate: false }
  if (error.code !== UNIQUE_VIOLATION) throw error

  const { data: existing, error: lookupError } = await db
    .from('events')
    .select()
    .eq('provider', provider)
    .eq('external_id', webhook.externalId)
    .single()
  if (lookupError) throw lookupError
  return { event: existing, duplicate: true }
}

/**
 * Queues an outbound action. The deterministic idempotency key means calling
 * this twice for the same work (e.g. a webhook replay) queues it once.
 */
export async function enqueue(
  db: ServiceClient,
  input: EnqueueInput & { orgId: string | null, parentEventId?: string | null },
): Promise<StoredEvent> {
  const { data, error } = await db
    .from('events')
    .insert({
      org_id: input.orgId,
      direction: 'outbound',
      provider: input.provider,
      type: input.action,
      idempotency_key: input.idempotencyKey,
      order_id: input.orderId ?? null,
      parent_event_id: input.parentEventId ?? null,
      max_attempts: input.maxAttempts ?? 5,
      request: asJson({ input: input.input }),
    })
    .select()
    .single()

  if (!error) return data
  if (error.code !== UNIQUE_VIOLATION) throw error

  const { data: existing, error: lookupError } = await db
    .from('events')
    .select()
    .eq('provider', input.provider)
    .eq('idempotency_key', input.idempotencyKey)
    .single()
  if (lookupError) throw lookupError
  return existing
}

/** The worker's view of the database (see server/lib/worker.ts). */
export function supabaseEventRepo(db: ServiceClient): EventRepo {
  return {
    async claim(batch) {
      const { data, error } = await db.rpc('claim_events', { batch })
      if (error) throw error
      return data ?? []
    },

    async recordAttempt({ event, startedAt, durationMs, httpStatus, error, response }) {
      const { error: dbError } = await db.from('event_attempts').insert({
        event_id: event.id,
        org_id: event.org_id,
        attempt_no: event.attempts,
        started_at: startedAt.toISOString(),
        duration_ms: durationMs,
        http_status: httpStatus,
        error,
        response: asJson(response),
      })
      if (dbError) throw dbError
    },

    async markSucceeded(event, result) {
      const { error } = await db
        .from('events')
        .update({
          status: result.status ?? 'succeeded',
          response: asJson(result.response ?? null),
          http_status: result.httpStatus ?? null,
          order_id: result.orderId ?? event.order_id,
          error: null,
          locked_at: null,
          processed_at: new Date().toISOString(),
        })
        .eq('id', event.id)
      if (error) throw error
    },

    async markFailed(event, failure) {
      const { error } = await db
        .from('events')
        .update({
          status: failure.nextAttemptAt ? 'failed' : 'dead',
          error: failure.error,
          http_status: failure.httpStatus,
          response: asJson(failure.response),
          next_attempt_at: (failure.nextAttemptAt ?? new Date()).toISOString(),
          locked_at: null,
        })
        .eq('id', event.id)
      if (error) throw error
    },
  }
}

// Framework-free so integrations can use it too (see server/lib/event-log.ts).
export { recordSyncCall } from '../lib/event-log'
