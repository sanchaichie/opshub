import { PermanentError } from '../../lib/errors'
import { httpRequest } from '../../lib/http'

/** Minimal EasyPost REST client on top of server/lib/http.ts (JSON, Basic auth). */

const EASYPOST_API = 'https://api.easypost.com/v2'

export interface EasyPostCall {
  apiKey: string
  method: 'GET' | 'POST'
  path: string
  body?: Record<string, unknown>
}

export function easypostRequest<T>({ apiKey, method, path, body }: EasyPostCall) {
  if (!apiKey) throw new PermanentError('EasyPost is not configured (NUXT_EASYPOST_API_KEY is empty)')
  // Test mode only (ADR 0002): test keys start with EZTK, production keys with EZAK.
  if (!apiKey.startsWith('EZTK')) throw new PermanentError('OpsHub only uses EasyPost test-mode keys')

  return httpRequest<T>({
    url: `${EASYPOST_API}${path}`,
    method,
    headers: { authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
    body,
    // Buying a label can take a few seconds while EasyPost talks to the carrier.
    timeoutMs: 20_000,
  })
}
