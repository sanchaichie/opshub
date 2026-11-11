import { z } from 'zod'
import { PermanentError } from '../../lib/errors'
import { httpRequest } from '../../lib/http'
import type { OAuthConfig, OAuthResult } from '../types'

/**
 * Google OAuth for the Gmail + Calendar integration. A SEPARATE OAuth client
 * from "Sign in with Google" (that one lives in Supabase Auth), asking only
 * for what the features need: send mail, manage calendar events, and the
 * account's email address for the Connections page.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
]
const REQUIRED = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/calendar.events']

const tokenResponse = z.looseObject({
  access_token: z.string(),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().optional(),
  scope: z.string().default(''),
})
const userInfo = z.looseObject({ email: z.email(), sub: z.string() })

async function token(params: Record<string, string>) {
  const { data } = await httpRequest<unknown>({
    url: 'https://oauth2.googleapis.com/token',
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const parsed = tokenResponse.safeParse(data)
  if (!parsed.success) throw new PermanentError('Unexpected Google token response')
  return parsed.data
}

const expiry = (seconds: number) => new Date(Date.now() + seconds * 1000)

export const googleOAuth: OAuthConfig = {
  pkce: true,

  isConfigured: config => Boolean(config.googleClientId && config.googleClientSecret),

  authorizeUrl: ({ config, state, redirectUri, codeChallenge }) => {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', config.googleClientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
    // offline + consent: Google only issues a refresh token this way.
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', codeChallenge!)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
  },

  exchangeCode: async ({ config, code, redirectUri, codeVerifier }): Promise<OAuthResult> => {
    const t = await token({
      grant_type: 'authorization_code',
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier ?? '',
    })
    if (!t.refresh_token) throw new PermanentError('Google did not return a refresh token; please try connecting again')

    // Google's consent screen lets people untick individual permissions.
    const granted = t.scope.split(' ')
    const missing = REQUIRED.filter(s => !granted.includes(s))
    if (missing.length) throw new PermanentError('Both Gmail sending and Calendar access are needed; please allow them when connecting')

    const info = userInfo.safeParse((await httpRequest<unknown>({
      url: 'https://openidconnect.googleapis.com/v1/userinfo',
      headers: { authorization: `Bearer ${t.access_token}` },
    })).data)
    if (!info.success) throw new PermanentError('Unexpected Google account response')

    return {
      credentials: { access_token: t.access_token, refresh_token: t.refresh_token },
      expiresAt: expiry(t.expires_in),
      accountLabel: info.data.email,
      externalAccountId: info.data.sub,
      scopes: granted,
      metadata: { email: info.data.email },
    }
  },

  refresh: async ({ config, credentials }) => {
    const refreshToken = credentials.refresh_token
    if (typeof refreshToken !== 'string') throw new PermanentError('No Google refresh token stored; reconnect Google')
    const t = await token({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
    })
    // Google doesn't rotate refresh tokens on refresh (and usually omits it):
    // keep the one we have unless a new one is sent.
    return { credentials: { access_token: t.access_token, refresh_token: t.refresh_token ?? refreshToken }, expiresAt: expiry(t.expires_in) }
  },
}
