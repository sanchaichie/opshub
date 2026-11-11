import { z } from 'zod'
import { PermanentError } from '../../lib/errors'
import { httpRequest } from '../../lib/http'
import type { OAuthConfig, OAuthResult } from '../types'
import { HUBSPOT_API, hubspotRequest } from './api'

/** Read/write contacts and deals, plus creating OpsHub's two deal properties. */
export const HUBSPOT_SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  'crm.schemas.deals.read',
  'crm.schemas.deals.write',
]

const tokenResponse = z.looseObject({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive(),
})

const tokenInfo = z.looseObject({ hub_id: z.number(), hub_domain: z.string() })

async function token(params: Record<string, string>): Promise<z.infer<typeof tokenResponse>> {
  const { data } = await httpRequest<unknown>({
    url: `${HUBSPOT_API}/oauth/v1/token`,
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const parsed = tokenResponse.safeParse(data)
  if (!parsed.success) throw new PermanentError('Unexpected HubSpot token response')
  return parsed.data
}

/**
 * The deal properties OpsHub relies on. `opshub_order_id` is UNIQUE, so every
 * sync can be an upsert keyed on it: a retried job updates the same deal
 * rather than creating a duplicate (HubSpot has no idempotency-key header).
 */
export const DEAL_PROPERTIES = [
  { name: 'opshub_order_id', label: 'OpsHub order ID', type: 'string', fieldType: 'text', groupName: 'dealinformation', hasUniqueValue: true },
  { name: 'opshub_status', label: 'OpsHub fulfilment status', type: 'string', fieldType: 'text', groupName: 'dealinformation' },
]

export async function ensureDealProperties(accessToken: string): Promise<void> {
  for (const property of DEAL_PROPERTIES) {
    try {
      await hubspotRequest({ token: accessToken, method: 'POST', path: '/crm/v3/properties/deals', body: property })
    }
    catch (error) {
      // 409: already exists (reconnecting, or another OpsHub org on the same portal).
      if ((error as { details?: { httpStatus?: number } }).details?.httpStatus !== 409) throw error
    }
  }
}

const toResult = (t: z.infer<typeof tokenResponse>, extra: Partial<OAuthResult> = {}): OAuthResult => ({
  credentials: { access_token: t.access_token, refresh_token: t.refresh_token },
  expiresAt: new Date(Date.now() + t.expires_in * 1000),
  ...extra,
})

export const hubspotOAuth: OAuthConfig = {
  // HubSpot authenticates the app with its client secret.
  pkce: false,

  isConfigured: config => Boolean(config.hubspotClientId && config.hubspotClientSecret),

  authorizeUrl: ({ config, state, redirectUri }) => {
    const url = new URL('https://app.hubspot.com/oauth/authorize')
    url.searchParams.set('client_id', config.hubspotClientId)
    url.searchParams.set('scope', HUBSPOT_SCOPES.join(' '))
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    return url.toString()
  },

  exchangeCode: async ({ config, code, redirectUri }) => {
    const t = await token({
      grant_type: 'authorization_code',
      client_id: config.hubspotClientId,
      client_secret: config.hubspotClientSecret,
      redirect_uri: redirectUri,
      code,
    })

    // HubSpot's token-info endpoint takes the token in the URL path. That's
    // only safe because server/lib/http.ts puts nothing but the host in error
    // messages, and this call isn't recorded in the event log. Keep it that way.
    const info = tokenInfo.safeParse((await hubspotRequest<unknown>({ token: t.access_token, method: 'GET', path: `/oauth/v1/access-tokens/${encodeURIComponent(t.access_token)}` })).data)
    if (!info.success) throw new PermanentError('Unexpected HubSpot account response')

    await ensureDealProperties(t.access_token)

    return toResult(t, {
      accountLabel: info.data.hub_domain,
      externalAccountId: String(info.data.hub_id),
      scopes: HUBSPOT_SCOPES,
      metadata: { portal_id: info.data.hub_id, hub_domain: info.data.hub_domain },
    })
  },

  refresh: async ({ config, credentials }) => {
    const refreshToken = credentials.refresh_token
    if (typeof refreshToken !== 'string') throw new PermanentError('No HubSpot refresh token stored; reconnect HubSpot')
    return toResult(await token({
      grant_type: 'refresh_token',
      client_id: config.hubspotClientId,
      client_secret: config.hubspotClientSecret,
      refresh_token: refreshToken,
    }))
  },
}
