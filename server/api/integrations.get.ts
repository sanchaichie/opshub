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
    easypost: Boolean(config.easypostApiKey && config.easypostWebhookSecret),
    claude: Boolean(config.anthropicApiKey),
  }

  return listIntegrations()
    .filter(integration => integration.id !== 'opshub') // internal, not a connection
    .map(integration => ({
      id: integration.id,
      kind: integration.kind,
      displayName: integration.displayName,
      // Connected integrations: whether the app's OAuth client is set up.
      configured: integration.oauth ? integration.oauth.isConfigured(config) : (configured[integration.id] ?? false),
      connectable: Boolean(integration.oauth),
      webhookUrl: integration.webhook ? `${siteUrl}/api/webhooks/${integration.id}` : null,
    }))
})
