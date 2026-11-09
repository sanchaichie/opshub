import type { H3Event } from 'h3'
import { z } from 'zod'
import { getIntegration } from '../integrations/registry'
import type { Integration, OAuthConfig } from '../integrations/types'

export const OAUTH_COOKIE = 'opshub_oauth_state'

/** Owners and admins manage connections; the shared demo can't (ADR 0002). */
export const CONNECTION_ROLES = ['owner', 'admin'] as const

const providerParam = z.object({ provider: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/) })

/** The integration named in the route, if it supports OAuth and the server has its app keys. */
export async function oauthIntegration(event: H3Event): Promise<Integration & { oauth: OAuthConfig }> {
  const { provider } = await getValidatedRouterParams(event, providerParam.parse)
  const integration = getIntegration(provider)
  if (!integration?.oauth) throw createError({ statusCode: 404, statusMessage: 'Unknown provider' })
  if (!integration.oauth.isConfigured(useRuntimeConfig(event))) {
    throw createError({ statusCode: 503, statusMessage: `${integration.displayName} isn't configured on this server yet` })
  }
  return integration as Integration & { oauth: OAuthConfig }
}

/** Ends the callback by sending the user back to Connections with a short, fixed status code (never provider text). */
export function backToConnections(event: H3Event, params: Record<string, string>) {
  return sendRedirect(event, `/connections?${new URLSearchParams(params)}`, 302)
}
