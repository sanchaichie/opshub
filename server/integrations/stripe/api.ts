import { httpRequest } from '../../lib/http'
import { PermanentError } from '../../lib/errors'

/**
 * Minimal Stripe REST client on top of server/lib/http.ts, so Stripe calls get
 * the same timeouts, retry classification and idempotency handling as every
 * other provider. Stripe's API takes form-encoded bodies with bracketed keys
 * (`metadata[org_id]=...`), which `toForm` produces from plain objects.
 */

const STRIPE_API = 'https://api.stripe.com/v1'

type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue }

export function toForm(params: Record<string, FormValue>, prefix = '', form = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    const name = prefix ? `${prefix}[${key}]` : key

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === 'object') toForm(item as Record<string, FormValue>, `${name}[${index}]`, form)
        else if (item !== undefined && item !== null) form.append(`${name}[${index}]`, String(item))
      })
    }
    else if (typeof value === 'object') {
      toForm(value, name, form)
    }
    else {
      form.append(name, String(value))
    }
  }
  return form
}

export interface StripeCall {
  secretKey: string
  method: 'GET' | 'POST'
  path: string
  params?: Record<string, FormValue>
  /** Stripe dedupes POSTs with the same key for 24h. */
  idempotencyKey?: string
}

export async function stripeRequest<T>({ secretKey, method, path, params, idempotencyKey }: StripeCall) {
  if (!secretKey) throw new PermanentError('Stripe is not configured (NUXT_STRIPE_SECRET_KEY is empty)')
  // Test mode only: refuse live keys outright (see ADR 0002).
  if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('rk_test_')) {
    throw new PermanentError('OpsHub only uses Stripe test-mode keys')
  }

  const query = method === 'GET' && params ? `?${toForm(params)}` : ''
  return httpRequest<T>({
    url: `${STRIPE_API}${path}${query}`,
    method,
    headers: {
      'authorization': `Bearer ${secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': '2024-06-20',
    },
    body: method === 'POST' && params ? toForm(params) : undefined,
    idempotencyKey,
  })
}
