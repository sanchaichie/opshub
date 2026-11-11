import { describe, expect, it, vi } from 'vitest'
import type { ActionContext, Integration, OAuthResult } from '../../server/integrations/types'
import { getFreshConnection, REFRESH_WINDOW_MS, withAuthRetry } from '../../server/lib/connections'
import { PermanentError, RetryableError } from '../../server/lib/errors'

const NOW = Date.parse('2026-11-10T12:00:00Z')

/** A minimal stand-in for the Supabase client: one connection row + its Vault secret. */
function fakeDb(row: { token_expires_at: string | null, status?: string }, secret: Record<string, unknown>) {
  const state = { row: { id: 'conn-1', status: 'connected', metadata: {}, ...row }, secret: JSON.stringify(secret), updates: [] as unknown[] }
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: state.row, error: null }),
    // A conditional update: applies only if every .eq()/.is() filter matches the row.
    update: (values: Record<string, unknown>) => {
      const filters: [string, unknown][] = []
      const chain = {
        eq: (column: string, value: unknown) => {
          filters.push([column, value])
          return chain
        },
        is: (column: string, value: unknown) => {
          filters.push([column, value])
          return chain
        },
        select: async () => apply(),
        then: (resolve: (v: unknown) => void) => resolve(apply()),
      }
      const apply = () => {
        const row = state.row as Record<string, unknown>
        const matches = filters.every(([column, value]) => column === 'id' || row[column] === value)
        if (!matches) return { data: [], error: null }
        state.updates.push(values)
        Object.assign(state.row, values)
        return { data: [{ id: state.row.id }], error: null }
      }
      return chain
    },
  }
  const db = {
    from: () => query,
    rpc: async (fn: string, args: { secret?: string }) => {
      if (fn === 'get_connection_secret') return { data: state.secret, error: null }
      if (fn === 'set_connection_secret') state.secret = args.secret!
      return { data: null, error: null }
    },
  }
  return { db, state }
}

const ctxWith = (db: unknown) => ({ db, config: {}, event: { org_id: 'org-1' } }) as unknown as ActionContext

function integrationWith(refresh: () => Promise<OAuthResult>): Integration {
  return { id: 'hubspot', kind: 'connected', displayName: 'HubSpot', actions: {}, oauth: { pkce: false, isConfigured: () => true, authorizeUrl: () => '', exchangeCode: vi.fn(), refresh: vi.fn(refresh) } }
}

const freshTokens = (): OAuthResult => ({ credentials: { access_token: 'new', refresh_token: 'r' }, expiresAt: new Date(NOW + 30 * 60_000) })

describe('getFreshConnection', () => {
  it('uses the stored token while it is comfortably valid', async () => {
    const { db } = fakeDb({ token_expires_at: new Date(NOW + REFRESH_WINDOW_MS + 60_000).toISOString() }, { access_token: 'old' })
    const integration = integrationWith(async () => freshTokens())
    const conn = await getFreshConnection<{ access_token: string }>(ctxWith(db), integration, NOW)
    expect(conn.credentials.access_token).toBe('old')
    expect(integration.oauth!.refresh).not.toHaveBeenCalled()
  })

  it('refreshes inside the window and stores the new tokens', async () => {
    const { db, state } = fakeDb({ token_expires_at: new Date(NOW + 30_000).toISOString() }, { access_token: 'old' })
    const conn = await getFreshConnection<{ access_token: string }>(ctxWith(db), integrationWith(async () => freshTokens()), NOW)
    expect(conn.credentials.access_token).toBe('new')
    expect(JSON.parse(state.secret).access_token).toBe('new')
    expect(state.row.token_expires_at).toBe(new Date(NOW + 30 * 60_000).toISOString())
  })

  it('keeps newer tokens if the connection changed while refreshing (e.g. an admin reconnected)', async () => {
    const original = new Date(NOW + 30_000).toISOString()
    const { db, state } = fakeDb({ token_expires_at: original }, { access_token: 'old' })
    const integration = integrationWith(async () => {
      // Meanwhile, someone reconnects: new tokens land first.
      state.row.token_expires_at = new Date(NOW + 60 * 60_000).toISOString()
      state.secret = JSON.stringify({ access_token: 'reconnected' })
      return freshTokens()
    })
    const conn = await getFreshConnection<{ access_token: string }>(ctxWith(db), integration, NOW)
    expect(conn.credentials.access_token).toBe('reconnected')
    expect(JSON.parse(state.secret).access_token).toBe('reconnected')
  })

  it('marks the connection broken when the refresh token was revoked', async () => {
    const { db, state } = fakeDb({ token_expires_at: new Date(NOW - 1000).toISOString() }, { access_token: 'old' })
    const integration = integrationWith(async () => {
      throw new PermanentError('invalid_grant')
    })
    await expect(getFreshConnection(ctxWith(db), integration, NOW)).rejects.toBeInstanceOf(PermanentError)
    expect(state.row.status).toBe('error')
    expect((state.row.metadata as { last_error: string }).last_error).toMatch(/reconnect/)
  })

  it('does not mark the connection broken for a transient refresh failure', async () => {
    const { db, state } = fakeDb({ token_expires_at: new Date(NOW - 1000).toISOString() }, { access_token: 'old' })
    const integration = integrationWith(async () => {
      throw new RetryableError('HubSpot 503')
    })
    await expect(getFreshConnection(ctxWith(db), integration, NOW)).rejects.toBeInstanceOf(RetryableError)
    expect(state.row.status).toBe('connected')
  })
})

describe('withAuthRetry', () => {
  const valid = () => new Date(Date.now() + 60 * 60_000).toISOString()

  it('refreshes once and retries once after a 401', async () => {
    const { db } = fakeDb({ token_expires_at: valid() }, { access_token: 'old' })
    const call = vi.fn(async (c: { access_token: string }) => {
      if (c.access_token === 'old') throw new PermanentError('401', { httpStatus: 401 })
      return 'ok'
    })
    expect(await withAuthRetry(ctxWith(db), integrationWith(async () => freshTokens()), call)).toBe('ok')
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('gives up after the retry also gets a 401', async () => {
    const { db } = fakeDb({ token_expires_at: valid() }, { access_token: 'old' })
    const call = vi.fn(async () => {
      throw new PermanentError('401', { httpStatus: 401 })
    })
    await expect(withAuthRetry(ctxWith(db), integrationWith(async () => freshTokens()), call)).rejects.toThrow('401')
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('does not refresh for other errors', async () => {
    const { db } = fakeDb({ token_expires_at: valid() }, { access_token: 'old' })
    const integration = integrationWith(async () => freshTokens())
    await expect(withAuthRetry(ctxWith(db), integration, async () => {
      throw new PermanentError('400', { httpStatus: 400 })
    })).rejects.toThrow('400')
    expect(integration.oauth!.refresh).not.toHaveBeenCalled()
  })
})
