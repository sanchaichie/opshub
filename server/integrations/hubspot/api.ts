import { RetryableError } from '../../lib/errors'
import { httpRequest } from '../../lib/http'

/** Minimal HubSpot REST client on top of server/lib/http.ts. */

export const HUBSPOT_API = 'https://api.hubapi.com'

/** HubSpot's burst limit is per 10 seconds, and its 429s often lack Retry-After. */
const RATE_WINDOW_MS = 10_000

export async function hubspotRequest<T>({ token, method, path, body }: {
  token: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH'
  path: string
  body?: unknown
}) {
  try {
    return await httpRequest<T>({ url: `${HUBSPOT_API}${path}`, method, headers: { authorization: `Bearer ${token}` }, body })
  }
  catch (error) {
    if (error instanceof RetryableError && error.details.httpStatus === 429 && error.details.retryAfterMs === undefined) {
      throw new RetryableError(error.message, { ...error.details, retryAfterMs: RATE_WINDOW_MS })
    }
    throw error
  }
}
