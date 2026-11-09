import { describe, expect, it, vi } from 'vitest'
import type { StoredEvent } from '../../server/integrations/types'
import { PermanentError, RetryableError } from '../../server/lib/errors'
import { runBatch, type EventRepo } from '../../server/lib/worker'

const NOW = new Date('2026-11-09T12:00:00Z')

function makeEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: crypto.randomUUID(),
    org_id: null,
    direction: 'outbound',
    provider: 'slack',
    type: 'notify',
    status: 'processing',
    external_id: null,
    idempotency_key: 'k',
    order_id: null,
    parent_event_id: null,
    request: null,
    response: null,
    http_status: null,
    error: null,
    attempts: 1, // claim_events has already counted this attempt
    max_attempts: 5,
    next_attempt_at: NOW.toISOString(),
    locked_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    processed_at: null,
    ...overrides,
  }
}

function fakeRepo(events: StoredEvent[]) {
  return {
    claim: vi.fn<EventRepo['claim']>().mockResolvedValue(events),
    recordAttempt: vi.fn<EventRepo['recordAttempt']>().mockResolvedValue(),
    markSucceeded: vi.fn<EventRepo['markSucceeded']>().mockResolvedValue(),
    markFailed: vi.fn<EventRepo['markFailed']>().mockResolvedValue(),
  } satisfies EventRepo
}

const run = (repo: EventRepo, dispatch: Parameters<typeof runBatch>[1]) =>
  runBatch(repo, dispatch, { now: () => NOW, random: () => 1 })

describe('runBatch', () => {
  it('marks a successful event succeeded and records the attempt', async () => {
    const event = makeEvent()
    const repo = fakeRepo([event])
    const summary = await run(repo, async () => ({ response: { ok: true }, httpStatus: 200 }))

    expect(summary).toEqual({ claimed: 1, succeeded: 1, retrying: 0, dead: 0 })
    expect(repo.markSucceeded).toHaveBeenCalledWith(event, { response: { ok: true }, httpStatus: 200 })
    expect(repo.recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ event, error: null, httpStatus: 200 }))
  })

  it('schedules a retry with backoff after a retryable failure', async () => {
    const repo = fakeRepo([makeEvent({ attempts: 2 })])
    const summary = await run(repo, async () => {
      throw new RetryableError('POST slack.com responded 503', { httpStatus: 503 })
    })

    expect(summary.retrying).toBe(1)
    const failure = repo.markFailed.mock.calls[0]![1]
    expect(failure.httpStatus).toBe(503)
    // attempt 2, no jitter → 20s
    expect(failure.nextAttemptAt).toEqual(new Date(NOW.getTime() + 20_000))
  })

  it('honors Retry-After from a 429', async () => {
    const repo = fakeRepo([makeEvent()])
    await run(repo, async () => {
      throw new RetryableError('rate limited', { httpStatus: 429, retryAfterMs: 90_000 })
    })
    expect(repo.markFailed.mock.calls[0]![1].nextAttemptAt).toEqual(new Date(NOW.getTime() + 90_000))
  })

  it('treats unexpected errors as retryable', async () => {
    const repo = fakeRepo([makeEvent()])
    const summary = await run(repo, async () => {
      throw new TypeError('cannot read properties of undefined')
    })
    expect(summary.retrying).toBe(1)
  })

  it('gives up immediately on a permanent error', async () => {
    const repo = fakeRepo([makeEvent({ attempts: 1 })])
    const summary = await run(repo, async () => {
      throw new PermanentError('400 bad request', { httpStatus: 400, response: { error: 'invalid' } })
    })

    expect(summary.dead).toBe(1)
    expect(repo.markFailed.mock.calls[0]![1]).toMatchObject({ nextAttemptAt: null, httpStatus: 400, response: { error: 'invalid' } })
  })

  it('gives up after the last allowed attempt', async () => {
    const repo = fakeRepo([makeEvent({ attempts: 5, max_attempts: 5 })])
    const summary = await run(repo, async () => {
      throw new RetryableError('still down')
    })
    expect(summary.dead).toBe(1)
    expect(repo.markFailed.mock.calls[0]![1].nextAttemptAt).toBeNull()
  })

  it('keeps going when one event in the batch fails', async () => {
    const repo = fakeRepo([makeEvent({ type: 'bad' }), makeEvent({ type: 'good' })])
    const summary = await run(repo, async (event) => {
      if (event.type === 'bad') throw new PermanentError('nope')
      return {}
    })
    expect(summary).toEqual({ claimed: 2, succeeded: 1, retrying: 0, dead: 1 })
  })

  it('does nothing when there is nothing to claim', async () => {
    const repo = fakeRepo([])
    const dispatch = vi.fn()
    expect(await run(repo, dispatch)).toEqual({ claimed: 0, succeeded: 0, retrying: 0, dead: 0 })
    expect(dispatch).not.toHaveBeenCalled()
  })
})
