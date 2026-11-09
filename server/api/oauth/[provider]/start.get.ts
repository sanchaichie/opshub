import { z } from 'zod'
import { newState, pkcePair, redirectUriFor } from '../../../lib/oauth'

const query = z.object({ orgId: z.uuid() })

/**
 * "Connect <provider>": checks the caller may manage this org's connections,
 * records a single-use state (and PKCE verifier) server-side, binds it to
 * this browser with an httpOnly cookie, and redirects to the provider.
 */
export default defineEventHandler(async (event) => {
  const integration = await oauthIntegration(event)
  const { orgId } = await getValidatedQuery(event, query.parse)

  const membership = await requireOrgRole(event, orgId, CONNECTION_ROLES)
  forbidInDemo(membership, 'Changing connections')

  const config = useRuntimeConfig(event)
  const { state, stateHash } = newState()
  const pkce = integration.oauth.pkce ? pkcePair() : null

  const { error } = await useServiceClient(event).rpc('oauth_state_create', {
    state_hash: stateHash,
    org: orgId,
    member: membership.userId,
    provider: integration.id,
    code_verifier: pkce?.verifier,
  })
  if (error) throw error

  setCookie(event, OAUTH_COOKIE, state, {
    httpOnly: true,
    secure: !import.meta.dev,
    // Lax: sent on the provider's top-level redirect back to us.
    sameSite: 'lax',
    path: '/api/oauth',
    maxAge: 600,
  })

  return sendRedirect(event, integration.oauth.authorizeUrl({
    config,
    state,
    redirectUri: redirectUriFor(config.public.siteUrl, integration.id),
    codeChallenge: pkce?.challenge,
  }), 302)
})
