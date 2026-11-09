import { z } from 'zod'
import { getIntegration } from '../../integrations/registry'

const params = z.object({ provider: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/) })

/**
 * The single inbound endpoint for every provider: /api/webhooks/<provider>.
 * Deliberately thin, in this order: verify the signature on the raw body →
 * store the event (idempotently) → answer 200 → process after responding.
 * Nothing with side effects runs before the event is safely stored.
 */
export default defineEventHandler(async (event) => {
  const { provider } = await getValidatedRouterParams(event, params.parse)
  const integration = getIntegration(provider)
  if (!integration?.webhook) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown webhook provider' })
  }

  const body = await readRawBody(event, 'utf8')
  if (!body) throw createError({ statusCode: 400, statusMessage: 'Empty body' })

  const headers = Object.fromEntries(
    Object.entries(getRequestHeaders(event)).map(([key, value]) => [key.toLowerCase(), value]),
  )

  let verified
  try {
    verified = await integration.webhook.verify({ body, headers }, useRuntimeConfig(event))
  }
  catch (error) {
    // Logged for us; the caller only learns that it was rejected.
    console.warn(`[webhook:${provider}] rejected:`, (error as Error).message)
    throw createError({ statusCode: 400, statusMessage: 'Invalid webhook' })
  }

  const db = useServiceClient(event)
  const claimedOrgId = verified.orgId ?? (await integration.webhook.resolveOrgId?.(db, verified)) ?? null
  const orgId = await existingOrgId(db, claimedOrgId)
  const { event: stored, duplicate } = await recordInbound(db, provider, { ...verified, orgId }, headers)

  // A duplicate was already queued when it first arrived; don't run it twice.
  if (!duplicate) processSoon(event)

  return { received: true, duplicate, event_id: stored.id }
})

/** Metadata is attacker-influenced only within our own Stripe account, but check the org exists anyway. */
async function existingOrgId(db: ReturnType<typeof useServiceClient>, orgId: string | null): Promise<string | null> {
  if (!orgId) return null
  const { data, error } = await db.from('organizations').select('id').eq('id', orgId).maybeSingle()
  // Throwing returns a 500, so the provider redelivers later. Swallowing the
  // error would store the event without its org and silently lose the order.
  if (error) throw error
  return data?.id ?? null
}
