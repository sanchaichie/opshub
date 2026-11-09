import { z } from 'zod'

const params = z.object({ provider: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/) })
const query = z.object({ orgId: z.uuid() })

/**
 * Disconnects an integration. Deleting the row cascades to its Vault secret
 * (trigger in migration orders_events), so the credentials are destroyed too.
 */
export default defineEventHandler(async (event) => {
  const { provider } = await getValidatedRouterParams(event, params.parse)
  const { orgId } = await getValidatedQuery(event, query.parse)

  const membership = await requireOrgRole(event, orgId, CONNECTION_ROLES)
  forbidInDemo(membership, 'Changing connections')

  const { data, error } = await useServiceClient(event)
    .from('connections')
    .delete()
    .eq('org_id', orgId)
    .eq('provider', provider)
    .select('id')
  if (error) {
    console.error(`[connections] disconnect ${provider} failed`, error.message)
    throw createError({ statusCode: 500, statusMessage: 'Could not disconnect; please try again' })
  }
  if (!data.length) throw createError({ statusCode: 404, statusMessage: 'Not connected' })

  return { disconnected: provider }
})
