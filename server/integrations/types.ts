import type { SupabaseClient } from '@supabase/supabase-js'
import type { RuntimeConfig } from 'nuxt/schema'
import type { Database, Tables } from '../../shared/types/database.types'

/**
 * The contract every third-party integration implements.
 *
 * An integration only describes *what* to do with a provider. The core
 * (server/lib/worker.ts + server/utils/events.ts) owns *how*: storing events,
 * redaction, retries with backoff, attempt history, and the inspector UI.
 * That split is why adding a provider is one folder plus a registry line.
 */

export type ProviderId = 'opshub' | 'stripe' | 'easypost' | 'slack' | 'hubspot' | 'google' | 'claude' | 'discord'

export type StoredEvent = Tables<'events'>
export type ServiceClient = SupabaseClient<Database>

/** A webhook request exactly as received: the raw body is needed for signatures. */
export interface RawWebhook {
  body: string
  headers: Record<string, string | undefined>
}

/** What `verify` extracts from a genuine webhook. */
export interface VerifiedWebhook {
  /** The provider's own event id: the idempotency key for inbound events. */
  externalId: string
  type: string
  /** Null when the payload doesn't say; the event is stored but stays invisible. */
  orgId: string | null
  payload: unknown
}

export interface EnqueueInput {
  provider: ProviderId
  action: string
  /** Deterministic, e.g. `slack.notify_shipped:<orderId>`; makes enqueueing idempotent. */
  idempotencyKey: string
  input: Record<string, unknown>
  orderId?: string | null
  maxAttempts?: number
}

export interface ActionContext {
  db: ServiceClient
  config: RuntimeConfig
  /** The event being processed (inbound webhook or outbound action). */
  event: StoredEvent
  /** Enqueue follow-up work, linked to this event as its parent and org. */
  enqueue: (input: EnqueueInput) => Promise<StoredEvent>
}

export interface ActionResult {
  /** Stored (redacted) as the event's response. */
  response?: unknown
  httpStatus?: number
  /** Links the event to the order it concerns, for the order timeline. */
  orderId?: string
  /** `ignored`: verified and stored, but nothing to do (e.g. an event type we don't use). */
  status?: 'succeeded' | 'ignored'
}

/** What a provider's OAuth code exchange (or token refresh) yields. */
export interface OAuthResult {
  /** Stored in Vault only. Never logged, never returned to the browser. */
  credentials: Record<string, unknown>
  /** Non-secret, shown on the Connections page (e.g. "#orders in Acme"). */
  accountLabel?: string
  externalAccountId?: string
  scopes?: string[]
  expiresAt?: Date | null
  /** Non-secret settings (e.g. Slack channel id). */
  metadata?: Record<string, unknown>
}

export interface OAuthConfig {
  /** Use PKCE (RFC 7636) when the provider supports it. */
  pkce: boolean
  authorizeUrl: (p: { config: RuntimeConfig, state: string, redirectUri: string, codeChallenge?: string }) => string
  exchangeCode: (p: { config: RuntimeConfig, code: string, redirectUri: string, codeVerifier?: string }) => Promise<OAuthResult>
  /** For providers with expiring access tokens (HubSpot, Google). */
  refresh?: (p: { config: RuntimeConfig, credentials: Record<string, unknown> }) => Promise<OAuthResult>
  /** Server has the app's client id/secret configured. */
  isConfigured: (config: RuntimeConfig) => boolean
}

export interface Integration {
  id: ProviderId
  /** platform: our own API keys (env). connected: per-org OAuth/webhook credentials (Vault). See ADR 0003. */
  kind: 'platform' | 'connected'
  displayName: string

  webhook?: {
    /** Must check the signature over the raw body and throw on failure. */
    verify: (raw: RawWebhook, config: RuntimeConfig) => Promise<VerifiedWebhook> | VerifiedWebhook
    /**
     * For providers whose payloads don't carry our org id (e.g. EasyPost
     * trackers): find it from our own data, e.g. the order a tracker belongs to.
     */
    resolveOrgId?: (db: ServiceClient, webhook: VerifiedWebhook) => Promise<string | null>
    /** Runs later, in the worker, never inside the webhook request. */
    handle: (ctx: ActionContext, payload: unknown) => Promise<ActionResult>
  }

  /** Connected integrations: how an org links its own account (ADR 0003). */
  oauth?: OAuthConfig

  actions: Record<string, (ctx: ActionContext, input: Record<string, unknown>) => Promise<ActionResult>>
}
