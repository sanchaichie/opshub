import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Stripe webhook signature verification, implemented from Stripe's spec
 * rather than pulled in via the SDK, so the whole check is visible here:
 *
 *   Stripe-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 *
 * - The HMAC must be computed over the RAW body: re-serialized JSON won't match.
 * - The timestamp must be recent, which stops an attacker replaying a captured
 *   (validly signed) webhook later.
 * - Comparison is constant-time, so timing can't leak the expected signature.
 */

export const DEFAULT_TOLERANCE_SECONDS = 300

export class SignatureError extends Error {
  override readonly name = 'SignatureError'
}

export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  { toleranceSeconds = DEFAULT_TOLERANCE_SECONDS, now = Date.now() }: { toleranceSeconds?: number, now?: number } = {},
): void {
  if (!secret) throw new SignatureError('Webhook secret is not configured')
  if (!header) throw new SignatureError('Missing Stripe-Signature header')

  const parts = header.split(',').map(part => part.split('=', 2) as [string, string | undefined])
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1])
  const signatures = parts.filter(([key, value]) => key === 'v1' && value).map(([, value]) => value!)

  if (!Number.isInteger(timestamp) || signatures.length === 0) {
    throw new SignatureError('Malformed Stripe-Signature header')
  }

  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) {
    throw new SignatureError('Signature timestamp is outside the tolerance window')
  }

  const expected = Buffer.from(signStripePayload(rawBody, timestamp, secret), 'hex')
  const matches = signatures.some((candidate) => {
    const given = Buffer.from(candidate, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })

  if (!matches) throw new SignatureError('Signature does not match')
}

/** The HMAC Stripe sends; exported so tests (and local tooling) can sign payloads. */
export function signStripePayload(rawBody: string, timestamp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}
