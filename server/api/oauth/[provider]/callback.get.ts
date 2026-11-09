import { z } from 'zod'
import { saveConnection } from '../../../lib/connections'
import { errorMessage } from '../../../lib/errors'
import { recordSyncCall } from '../../../lib/event-log'
import { hashState, redirectUriFor, statesMatch } from '../../../lib/oauth'

const query = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().max(200).optional(),
})

/**
 * The provider redirects here after the user approves (or declines). Every
 * failure sends the user back to /connections with a fixed error code; the
 * details are logged server-side only.
 */
export default defineEventHandler(async (event) => {
  const integration = await oauthIntegration(event)
  const provider = integration.id
  const params = await getValidatedQuery(event, query.parse)

  const cookieState = getCookie(event, OAUTH_COOKIE)
  deleteCookie(event, OAUTH_COOKIE, { path: '/api/oauth' })

  // Must be the same browser that started the flow.
  if (!params.state || !statesMatch(params.state, cookieState)) {
    return backToConnections(event, { error: 'state_mismatch', provider })
  }

  const db = useServiceClient(event)
  const { data: pending, error: consumeError } = await db
    .rpc('oauth_state_consume', { state_hash: hashState(params.state), expected_provider: provider })
    .maybeSingle()
  if (consumeError) {
    console.error(`[oauth:${provider}] consuming state failed`, consumeError.message)
    return backToConnections(event, { error: 'exchange_failed', provider })
  }
  if (!pending || pending.expired) {
    return backToConnections(event, { error: 'expired', provider })
  }

  if (params.error || !params.code) {
    return backToConnections(event, { error: 'declined', provider })
  }

  // The same person must finish the flow, and must still be allowed to.
  const userId = await requireUserId(event)
  if (userId !== pending.user_id) return backToConnections(event, { error: 'state_mismatch', provider })
  const membership = await requireOrgRole(event, pending.org_id, CONNECTION_ROLES)
  forbidInDemo(membership, 'Changing connections')

  const config = useRuntimeConfig(event)
  const startedAt = new Date()
  const call = { orgId: pending.org_id, provider, action: 'oauth_connect', idempotencyKey: `${provider}.oauth_connect:${startedAt.getTime()}`, input: {}, startedAt }

  try {
    const result = await integration.oauth.exchangeCode({
      config,
      code: params.code,
      redirectUri: redirectUriFor(config.public.siteUrl, provider),
      codeVerifier: pending.code_verifier ?? undefined,
    })
    await saveConnection(db, { orgId: pending.org_id, provider, connectedBy: userId, result })
    // Logged without credentials: only what the Connections page shows anyway.
    await recordSyncCall(db, { ...call, outcome: { ok: true, httpStatus: 200, response: { account: result.accountLabel ?? null, scopes: result.scopes ?? [] } } })
    return backToConnections(event, { connected: provider })
  }
  catch (error) {
    console.error(`[oauth:${provider}] code exchange failed`, errorMessage(error))
    await recordSyncCall(db, { ...call, outcome: { ok: false, error: errorMessage(error) } })
    return backToConnections(event, { error: 'exchange_failed', provider })
  }
})
