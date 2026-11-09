import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * EasyPost webhook signatures:
 *
 *   X-Hmac-Signature: hmac-sha256-hex=<hex HMAC-SHA256 of the raw body>
 *
 * keyed with the webhook secret (Unicode-normalized, per EasyPost's client
 * libraries). Unlike Stripe there's no timestamp in the signature, so replay
 * protection comes from idempotency instead: each EasyPost event id is
 * stored once (unique provider + external_id), and a replay is a no-op.
 * That only holds while the row exists. The nightly demo reset deletes demo
 * events, so a captured body replayed later would be accepted again; the
 * damage is bounded because orders match only on unique tracker/shipment
 * ids, and signature headers are never stored (redactHeaders allowlist).
 */

export class SignatureError extends Error {
  override readonly name = 'SignatureError'
}

const PREFIX = 'hmac-sha256-hex='

export function signEasyPostPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret.normalize('NFKD')).update(rawBody, 'utf8').digest('hex')
}

export function verifyEasyPostSignature(rawBody: string, header: string | undefined, secret: string): void {
  if (!secret) throw new SignatureError('Webhook secret is not configured')
  if (!header?.startsWith(PREFIX)) throw new SignatureError('Missing or malformed X-Hmac-Signature header')

  const given = Buffer.from(header.slice(PREFIX.length), 'hex')
  const expected = Buffer.from(signEasyPostPayload(rawBody, secret), 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new SignatureError('Signature does not match')
  }
}
