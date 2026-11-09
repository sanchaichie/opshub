import { z } from 'zod'
import { PermanentError } from '../../lib/errors'
import { httpRequest } from '../../lib/http'
import type { OAuthConfig } from '../types'
import { isSlackWebhookUrl } from './message'

/**
 * Slack OAuth v2 with the `incoming-webhook` scope: Slack's own consent
 * screen asks which channel to post to, and the token response includes a
 * webhook URL for exactly that channel.
 */

const accessResponse = z.looseObject({
  ok: z.literal(true),
  access_token: z.string(),
  scope: z.string().default(''),
  team: z.looseObject({ id: z.string(), name: z.string() }),
  incoming_webhook: z.looseObject({ url: z.string(), channel: z.string(), channel_id: z.string() }),
})

export const slackOAuth: OAuthConfig = {
  // Slack's confidential-client flow authenticates with the client secret.
  pkce: false,

  isConfigured: config => Boolean(config.slackClientId && config.slackClientSecret),

  authorizeUrl: ({ config, state, redirectUri }) => {
    const url = new URL('https://slack.com/oauth/v2/authorize')
    url.searchParams.set('client_id', config.slackClientId)
    url.searchParams.set('scope', 'incoming-webhook')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    return url.toString()
  },

  exchangeCode: async ({ config, code, redirectUri }) => {
    const { data } = await httpRequest<unknown>({
      url: 'https://slack.com/api/oauth.v2.access',
      method: 'POST',
      body: new URLSearchParams({ client_id: config.slackClientId, client_secret: config.slackClientSecret, code, redirect_uri: redirectUri }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })

    // Slack reports failures as HTTP 200 with { ok: false, error }.
    const parsed = accessResponse.safeParse(data)
    if (!parsed.success) {
      const reason = (data as { error?: unknown } | null)?.error
      throw new PermanentError(`Slack rejected the authorization${typeof reason === 'string' ? ` (${reason})` : ''}`)
    }
    const { scope, team, incoming_webhook } = parsed.data
    if (!isSlackWebhookUrl(incoming_webhook.url)) throw new PermanentError('Slack returned an unexpected webhook URL')

    return {
      // Store only what posting needs: the webhook URL. Slack also returns an
      // access token, but keeping an unused credential only widens a leak.
      credentials: { webhook_url: incoming_webhook.url },
      accountLabel: `${incoming_webhook.channel} in ${team.name}`,
      externalAccountId: team.id,
      scopes: scope.split(',').filter(Boolean),
      metadata: { channel: incoming_webhook.channel, channel_id: incoming_webhook.channel_id, team_name: team.name },
    }
  },
}
