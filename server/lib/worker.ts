import type { ActionResult, StoredEvent } from '../integrations/types'
import { retryDelayMs } from './backoff'
import { errorMessage, isPermanent, PermanentError, RetryableError } from './errors'

/**
 * The retry engine, kept free of Supabase and Nuxt so its rules are unit-tested
 * directly (tests/unit/worker.test.ts). server/utils/worker.ts wires it to the
 * real database and integration registry.
 *
 * Rules:
 *   success                     → succeeded (or ignored)
 *   PermanentError              → dead immediately
 *   anything else, attempts < max → failed, retried after backoff (Retry-After honored)
 *   anything else, attempts = max → dead
 */

export interface AttemptRecord {
  event: StoredEvent
  startedAt: Date
  durationMs: number
  httpStatus: number | null
  error: string | null
  response: unknown
}

export interface EventRepo {
  /** Atomically claims runnable events and increments their attempt count. */
  claim: (batch: number) => Promise<StoredEvent[]>
  recordAttempt: (attempt: AttemptRecord) => Promise<void>
  markSucceeded: (event: StoredEvent, result: ActionResult) => Promise<void>
  /** `nextAttemptAt: null` means give up: the event becomes dead. */
  markFailed: (event: StoredEvent, failure: { error: string, httpStatus: number | null, response: unknown, nextAttemptAt: Date | null }) => Promise<void>
}

export type Dispatch = (event: StoredEvent) => Promise<ActionResult>

export interface RunSummary {
  claimed: number
  succeeded: number
  retrying: number
  dead: number
}

export interface RunOptions {
  batch?: number
  now?: () => Date
  random?: () => number
}

/** When (if ever) a failed event should run again. */
export function nextAttemptAfterFailure(event: StoredEvent, error: unknown, now: Date, random: () => number = Math.random): Date | null {
  if (isPermanent(error)) return null
  if (event.attempts >= event.max_attempts) return null

  const retryAfterMs = error instanceof RetryableError ? error.details.retryAfterMs : undefined
  return new Date(now.getTime() + retryDelayMs(event.attempts, { retryAfterMs, random }))
}

export async function runBatch(repo: EventRepo, dispatch: Dispatch, options: RunOptions = {}): Promise<RunSummary> {
  const { batch = 10, now = () => new Date(), random = Math.random } = options
  const events = await repo.claim(batch)
  const summary: RunSummary = { claimed: events.length, succeeded: 0, retrying: 0, dead: 0 }

  // Sequential on purpose: batches are small, and it keeps provider rate
  // limits predictable. Parallelism is a later optimization if ever needed.
  for (const event of events) {
    const startedAt = now()
    try {
      const result = await dispatch(event)
      await repo.recordAttempt({ event, startedAt, durationMs: elapsed(startedAt, now), httpStatus: result.httpStatus ?? null, error: null, response: result.response ?? null })
      await repo.markSucceeded(event, result)
      summary.succeeded++
    }
    catch (error) {
      const details = error instanceof RetryableError || error instanceof PermanentError ? error.details : {}
      const httpStatus = details.httpStatus ?? null
      const response = details.response ?? null
      const message = errorMessage(error)
      const nextAttemptAt = nextAttemptAfterFailure(event, error, now(), random)

      await repo.recordAttempt({ event, startedAt, durationMs: elapsed(startedAt, now), httpStatus, error: message, response })
      await repo.markFailed(event, { error: message, httpStatus, response, nextAttemptAt })
      if (nextAttemptAt) summary.retrying++
      else summary.dead++
    }
  }

  return summary
}

function elapsed(startedAt: Date, now: () => Date): number {
  return Math.max(0, now().getTime() - startedAt.getTime())
}
