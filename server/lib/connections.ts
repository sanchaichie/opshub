import type { Json } from '../../shared/types/database.types'
import type { ActionContext, Integration, OAuthResult, ProviderId, ServiceClient } from '../integrations/types'
import { PermanentError } from './errors'

/**
 * Connected-integration credentials, for use inside actions. Credentials live
 * in Supabase Vault (see migration orders_events: set/get_connection_secret);
 * the `connections` row only holds non-secret details.
 */

export interface Connection<C> {
  id: string
  credentials: C
  metadata: Record<string, unknown>
  /** When the access token expires; null for tokens that don't (e.g. Slack webhooks). */
  expiresAt: Date | null
}

/** Saves (or re-saves) a connection and its credentials. Used by the OAuth callback and refresh. */
export async function saveConnection(
  db: ServiceClient,
  { orgId, provider, connectedBy, result }: { orgId: string, provider: ProviderId, connectedBy: string | null, result: OAuthResult },
): Promise<string> {
  const { data, error } = await db
    .from('connections')
    .upsert({
      org_id: orgId,
      provider,
      status: 'connected',
      account_label: result.accountLabel ?? null,
      external_account_id: result.externalAccountId ?? null,
      scopes: result.scopes ?? [],
      token_expires_at: result.expiresAt?.toISOString() ?? null,
      metadata: (result.metadata ?? {}) as { [key: string]: Json },
      ...(connectedBy ? { connected_by: connectedBy } : {}),
    }, { onConflict: 'org_id,provider' })
    .select('id')
    .single()
  if (error) throw error

  const { error: secretError } = await db.rpc('set_connection_secret', { connection: data.id, secret: JSON.stringify(result.credentials) })
  if (secretError) throw secretError
  return data.id
}

/**
 * The org's credentials for `provider`, or a PermanentError if it isn't
 * connected. Retrying can't fix a missing connection; the event inspector
 * shows the reason and Retry works once the org connects.
 */
export async function getConnection<C>(ctx: ActionContext, provider: ProviderId): Promise<Connection<C>> {
  if (!ctx.event.org_id) throw new PermanentError('Event has no organization')

  const { data: connection, error } = await ctx.db
    .from('connections')
    .select('id, status, metadata, token_expires_at')
    .eq('org_id', ctx.event.org_id)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw error
  if (!connection || connection.status === 'revoked') throw new PermanentError(`${provider} is not connected for this organization`)

  const { data: secret, error: secretError } = await ctx.db.rpc('get_connection_secret', { connection: connection.id })
  if (secretError) throw secretError
  if (!secret) throw new PermanentError(`${provider} credentials are missing; reconnect it`)

  return {
    id: connection.id,
    credentials: JSON.parse(secret) as C,
    metadata: (connection.metadata ?? {}) as Record<string, unknown>,
    expiresAt: connection.token_expires_at ? new Date(connection.token_expires_at) : null,
  }
}

/** Refresh this long before expiry, so a token can't expire mid-request. */
export const REFRESH_WINDOW_MS = 2 * 60_000

/**
 * Like getConnection, but refreshes an access token that is expired or about
 * to expire.
 *
 * Concurrency: two workers refreshing at once is harmless for HubSpot, whose
 * refresh tokens stay valid when used (and refreshConnection only saves if
 * nothing changed underneath it). A provider that ROTATES refresh tokens on
 * use would need a lock around the refresh instead; check before reusing this.
 */
export async function getFreshConnection<C>(ctx: ActionContext, integration: Integration, now = Date.now()): Promise<Connection<C>> {
  const connection = await getConnection<C>(ctx, integration.id)
  if (!integration.oauth?.refresh || !connection.expiresAt) return connection
  if (connection.expiresAt.getTime() - now > REFRESH_WINDOW_MS) return connection
  return refreshConnection(ctx, integration, connection)
}

export async function refreshConnection<C>(ctx: ActionContext, integration: Integration, connection: Connection<C>): Promise<Connection<C>> {
  let result: OAuthResult
  try {
    result = await integration.oauth!.refresh!({ config: ctx.config, credentials: connection.credentials as Record<string, unknown> })
  }
  catch (error) {
    // The provider refused the refresh token: access was revoked.
    if (error instanceof PermanentError) {
      await markConnectionError(ctx, connection, `${integration.displayName} access was revoked; reconnect it`)
    }
    throw error
  }

  // Save only if the tokens are still the ones we refreshed. If an admin
  // reconnected (perhaps to a different account) or another worker already
  // refreshed while we waited, keep theirs: overwriting would send this org's
  // syncs to the wrong account. Status and settings are left untouched.
  let update = ctx.db
    .from('connections')
    .update({ token_expires_at: result.expiresAt?.toISOString() ?? null })
    .eq('id', connection.id)
  update = connection.expiresAt
    ? update.eq('token_expires_at', connection.expiresAt.toISOString())
    : update.is('token_expires_at', null)
  const { data: saved, error } = await update.select('id')
  if (error) throw error
  if (!saved?.length) return getConnection<C>(ctx, integration.id)

  const { error: secretError } = await ctx.db.rpc('set_connection_secret', { connection: connection.id, secret: JSON.stringify(result.credentials) })
  if (secretError) throw secretError

  return { ...connection, credentials: result.credentials as C, expiresAt: result.expiresAt ?? null }
}

/**
 * Runs an API call with fresh credentials. If the provider still answers 401
 * (token revoked early, clock skew), refreshes once and retries once.
 */
export async function withAuthRetry<C, T>(ctx: ActionContext, integration: Integration, call: (credentials: C) => Promise<T>): Promise<T> {
  const connection = await getFreshConnection<C>(ctx, integration)
  try {
    return await call(connection.credentials)
  }
  catch (error) {
    const status = (error as { details?: { httpStatus?: number } }).details?.httpStatus
    if (status !== 401 || !integration.oauth?.refresh) throw error
    const refreshed = await refreshConnection(ctx, integration, connection)
    return call(refreshed.credentials)
  }
}

/** Whether an org has a usable connection, without loading credentials. */
export async function isConnected(db: ServiceClient, orgId: string, provider: ProviderId): Promise<boolean> {
  const { data, error } = await db.from('connections').select('status').eq('org_id', orgId).eq('provider', provider).maybeSingle()
  if (error) throw error
  return data?.status === 'connected'
}

/**
 * The provider rejected our credentials (app uninstalled, webhook deleted).
 * Flags the connection so the Connections page asks the org to reconnect.
 * The reason is a short, non-secret message we wrote, never provider output.
 */
export async function markConnectionError(ctx: ActionContext, connection: Connection<unknown>, reason: string): Promise<void> {
  const { error } = await ctx.db
    .from('connections')
    .update({
      status: 'error',
      metadata: { ...connection.metadata, last_error: reason, last_error_at: new Date().toISOString() } as { [key: string]: Json },
    })
    .eq('id', connection.id)
  if (error) throw error
}
