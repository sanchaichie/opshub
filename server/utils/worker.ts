import type { H3Event } from 'h3'
import type { RuntimeConfig } from 'nuxt/schema'
import { getIntegration } from '../integrations/registry'
import type { ActionContext, ServiceClient, StoredEvent } from '../integrations/types'
import { PermanentError } from '../lib/errors'
import { runBatch, type Dispatch, type RunSummary } from '../lib/worker'
import { enqueue, supabaseEventRepo, useServiceClient } from './events'

/**
 * Routes a claimed event to its integration: inbound events to the webhook
 * handler, outbound events to the named action.
 *
 * Handlers receive the payload as stored, i.e. already redacted. That's
 * deliberate: business logic must never depend on a secret from a webhook.
 */
export function createDispatch(db: ServiceClient, config: RuntimeConfig): Dispatch {
  return async (event: StoredEvent) => {
    const integration = getIntegration(event.provider)
    if (!integration) throw new PermanentError(`No integration registered for "${event.provider}".`)

    const ctx: ActionContext = {
      db,
      config,
      event,
      enqueue: input => enqueue(db, { ...input, orgId: event.org_id, parentEventId: event.id, orderId: input.orderId ?? event.order_id }),
    }

    const request = (event.request ?? {}) as { body?: unknown, input?: Record<string, unknown> }

    if (event.direction === 'inbound') {
      if (!integration.webhook) throw new PermanentError(`${integration.displayName} does not accept webhooks.`)
      return integration.webhook.handle(ctx, request.body)
    }

    const action = integration.actions[event.type]
    if (!action) throw new PermanentError(`Unknown action "${event.provider}.${event.type}".`)
    return action(ctx, request.input ?? {})
  }
}

/** Processes one batch of due events. Called by pg_cron, retries and webhooks. */
export function runWorker(event: H3Event, batch = 10): Promise<RunSummary> {
  const db = useServiceClient(event)
  return runBatch(supabaseEventRepo(db), createDispatch(db, useRuntimeConfig(event)), { batch })
}

/** Fast path budget: enough for a chain like payment → label → tracking. */
const FAST_PATH_BATCHES = 5
const FAST_PATH_MS = 15_000

/**
 * Runs the worker after the response is sent, so a webhook gets its 200
 * immediately and the event is usually processed within a second.
 *
 * Processing one event often enqueues the next step (a payment queues a
 * label purchase), so it keeps running batches while they find work, within
 * a small budget. If this is cut short (e.g. the serverless function
 * freezes), pg_cron's every-minute sweep picks everything up: nothing depends
 * on the fast path succeeding.
 */
export function processSoon(event: H3Event): void {
  const run = async () => {
    const started = Date.now()
    for (let i = 0; i < FAST_PATH_BATCHES && Date.now() - started < FAST_PATH_MS; i++) {
      const { claimed } = await runWorker(event)
      if (claimed === 0) break
    }
  }
  event.waitUntil(
    run().catch((error: unknown) => {
      console.error('[worker] fast-path run failed; pg_cron will retry', error)
    }),
  )
}
