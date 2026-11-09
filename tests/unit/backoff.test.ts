import { describe, expect, it } from 'vitest'
import { DEFAULT_BASE_MS, DEFAULT_MAX_MS, parseRetryAfter, retryDelayMs } from '../../server/lib/backoff'

const noJitter = () => 1 // upper bound of the jitter range
const minJitter = () => 0 // lower bound

describe('retryDelayMs', () => {
  it('doubles with each attempt', () => {
    expect(retryDelayMs(1, { random: noJitter })).toBe(DEFAULT_BASE_MS)
    expect(retryDelayMs(2, { random: noJitter })).toBe(DEFAULT_BASE_MS * 2)
    expect(retryDelayMs(3, { random: noJitter })).toBe(DEFAULT_BASE_MS * 4)
  })

  it('jitters between half and the full delay', () => {
    expect(retryDelayMs(3, { random: minJitter })).toBe(DEFAULT_BASE_MS * 2)
    const sampled = retryDelayMs(3)
    expect(sampled).toBeGreaterThanOrEqual(DEFAULT_BASE_MS * 2)
    expect(sampled).toBeLessThanOrEqual(DEFAULT_BASE_MS * 4)
  })

  it('never exceeds the cap', () => {
    expect(retryDelayMs(50, { random: noJitter })).toBe(DEFAULT_MAX_MS)
  })

  it('waits at least as long as Retry-After asks', () => {
    expect(retryDelayMs(1, { retryAfterMs: 120_000, random: noJitter })).toBe(120_000)
  })

  it('keeps its own delay when Retry-After is shorter', () => {
    expect(retryDelayMs(3, { retryAfterMs: 1_000, random: noJitter })).toBe(DEFAULT_BASE_MS * 4)
  })

  it('caps an absurd Retry-After', () => {
    expect(retryDelayMs(1, { retryAfterMs: 10 * DEFAULT_MAX_MS })).toBe(DEFAULT_MAX_MS)
  })
})

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-11-09T12:00:00Z')

  it('parses delay-seconds', () => {
    expect(parseRetryAfter('30', now)).toBe(30_000)
  })

  it('parses an HTTP date', () => {
    expect(parseRetryAfter('Mon, 09 Nov 2026 12:01:00 GMT', now)).toBe(60_000)
  })

  it('treats a date in the past as "now"', () => {
    expect(parseRetryAfter('Mon, 09 Nov 2026 11:00:00 GMT', now)).toBe(0)
  })

  it.each([null, undefined, '', 'soon', '-5'])('ignores %s', (value) => {
    expect(parseRetryAfter(value, now)).toBeUndefined()
  })
})
