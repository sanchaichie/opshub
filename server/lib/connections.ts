import type { Json } from '../../shared/types/database.types'
import type { ActionContext, OAuthResult, ProviderId, ServiceClient } from '../integrations/types'
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
    .select('id, status, metadata')
    .eq('org_id', ctx.event.org_id)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw error
  if (!connection || connection.status === 'revoked') throw new PermanentError(`${provider} is not connected for this organization`)

  const { data: secret, error: secretError } = await ctx.db.rpc('get_connection_secret', { connection: connection.id })
  if (secretError) throw secretError
  if (!secret) throw new PermanentError(`${provider} credentials are missing; reconnect it`)

  return { id: connection.id, credentials: JSON.parse(secret) as C, metadata: (connection.metadata ?? {}) as Record<string, unknown> }
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
