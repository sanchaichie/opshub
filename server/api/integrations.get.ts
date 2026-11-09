import { listIntegrations } from '../integrations/registry'

/**
 * Which integrations exist and whether the server has their keys. Returns
 * booleans only: never key values, prefixes or lengths.
 */
export default defineEventHandler(async (event) => {
  await requireUserId(event)
  const config = useRuntimeConfig(event)
  const siteUrl = config.public.siteUrl

  const configured: Record<string, boolean> = {
    stripe: Boolean(config.stripeSecretKey && config.stripeWebhookSecret),
  }

  return listIntegrations().map(integration => ({
    id: integration.id,
    kind: integration.kind,
    displayName: integration.displayName,
    configured: configured[integration.id] ?? false,
    webhookUrl: integration.webhook ? `${siteUrl}/api/webhooks/${integration.id}` : null,
  }))
})
