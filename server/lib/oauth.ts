import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Building blocks for the OAuth connect flow (server/utils/oauth-flow.ts).
 *
 * - `state`: 32 random bytes. Only its SHA-256 is stored server-side, and the
 *   raw value is also put in an httpOnly cookie, so the callback must come
 *   from the same browser that started the flow (stops login-CSRF, where an
 *   attacker tricks you into finishing *their* connect flow).
 * - PKCE (RFC 7636, S256): the verifier stays on the server.
 */

const base64url = (bytes: Buffer) => bytes.toString('base64url')

export function newState(): { state: string, stateHash: string } {
  const state = base64url(randomBytes(32))
  return { state, stateHash: hashState(state) }
}

export function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex')
}

/** Constant-time comparison of the state in the URL with the one in the cookie. */
export function statesMatch(fromQuery: string | undefined, fromCookie: string | undefined): boolean {
  if (!fromQuery || !fromCookie) return false
  const a = Buffer.from(fromQuery)
  const b = Buffer.from(fromCookie)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function pkcePair(): { verifier: string, challenge: string } {
  const verifier = base64url(randomBytes(48))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/** Fixed per provider: never taken from the request, so the flow can't be redirected elsewhere. */
export const redirectUriFor = (siteUrl: string, provider: string) =>
  `${siteUrl.replace(/\/$/, '')}/api/oauth/${provider}/callback`
