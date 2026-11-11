import { z } from 'zod'
import { getIntegration } from '../../integrations/registry'
import { saveConnection } from '../../lib/connections'
import { errorMessage, PermanentError } from '../../lib/errors'
import { recordSyncCall } from '../../lib/event-log'

const params = z.object({ provider: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/) })
const body = z.object({ orgId: z.uuid(), value: z.string().trim().min(1).max(500) })

/**
 * Connects an integration that uses a pasted secret instead of OAuth (e.g. a
 * Discord webhook URL). Same rules as OAuth: owners and admins only, never
 * the demo, and the secret goes straight to Vault.
 */
export default defineEventHandler(async (event) => {
  const { provider } = await getValidatedRouterParams(event, params.parse)
  const integration = getIntegration(provider)
  if (!integration?.manualConnect) throw createError({ statusCode: 404, statusMessage: 'Unknown provider' })

  const { orgId, value } = await readValidatedBody(event, body.parse)
  const membership = await requireOrgRole(event, orgId, CONNECTION_ROLES)
  forbidInDemo(membership, 'Changing connections')

  const db = useServiceClient(event)
  const startedAt = new Date()
  // Logged without the secret. The key only labels this one synchronous log
  // entry (nothing is retried from it), so a timestamp is enough; the
  // deterministic-key rule in CLAUDE.md is for queued work.
  const call = { orgId, provider: integration.id, action: 'connect', idempotencyKey: `${integration.id}.connect:${startedAt.getTime()}`, input: {}, startedAt }

  try {
    const result = await integration.manualConnect.connect(value)
    await saveConnection(db, { orgId, provider: integration.id, connectedBy: membership.userId, result })
    await recordSyncCall(db, { ...call, outcome: { ok: true, httpStatus: 200, response: { account: result.accountLabel ?? null } } })
    return { connected: integration.id, account: result.accountLabel ?? null }
  }
  catch (error) {
    await recordSyncCall(db, { ...call, outcome: { ok: false, error: errorMessage(error) } })
    // Our own validation messages are safe to show; anything else is generic.
    throw createError({ statusCode: 422, statusMessage: error instanceof PermanentError ? error.message : 'Could not verify that value' })
  }
})
