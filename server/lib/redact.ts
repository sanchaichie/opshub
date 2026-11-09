/**
 * Redaction for everything written to the event log.
 *
 * The webhook inspector shows request/response payloads to every member of an
 * org (and to anyone in the public demo), so credentials must never reach the
 * `events` table. Redaction is by key name and runs on every payload before
 * it is stored, so an integration can't forget it.
 */

const SENSITIVE_KEY = /authorization|cookie|password|passwd|secret|token|api[-_]?key|signature|private[-_]?key|client[-_]?secret|session/i

export const REDACTED = '[REDACTED]'

/** Strings longer than this are truncated so one huge payload can't bloat the log. */
const MAX_STRING = 4_000
const MAX_DEPTH = 12

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED: too deep]'

  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[TRUNCATED ${value.length - MAX_STRING} chars]` : value
  }

  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1))

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1),
      ]),
    )
  }

  return value
}

/** Header names are matched case-insensitively and only an allowlist is kept. */
const LOGGED_HEADERS = new Set(['content-type', 'user-agent', 'idempotency-key', 'retry-after', 'x-request-id', 'request-id'])

export function redactHeaders(headers: Record<string, string | undefined> | Headers): Record<string, string> {
  const entries = headers instanceof Headers ? [...headers.entries()] : Object.entries(headers)
  return Object.fromEntries(
    entries
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, val]) => [key.toLowerCase(), val] as const)
      .filter(([key]) => LOGGED_HEADERS.has(key)),
  )
}
