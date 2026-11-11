import Anthropic from '@anthropic-ai/sdk'
import { parseRetryAfter } from '../../lib/backoff'
import { PermanentError, RetryableError } from '../../lib/errors'

/**
 * The Claude call, through the official SDK. Two deliberate settings:
 *
 * - `maxRetries: 0`: OpsHub's own rules decide what's retried and when
 *   (server/lib/worker.ts), so the SDK's built-in retries are turned off and
 *   its typed errors are mapped to RetryableError / PermanentError below.
 * - Server-side refusal fallbacks: if the model declines, the API re-runs the
 *   request on a fallback model inside the same call.
 */

/** Models that accept the server-side `fallbacks` parameter. */
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

export const MAX_OUTPUT_TOKENS = 2_048

export interface ClaudeResult {
  text: string
  /** The model that actually answered (differs from the request after a fallback). */
  model: string
  inputTokens: number
  outputTokens: number
  fellBack: boolean
}

export async function generate({ apiKey, model, system, user }: { apiKey: string, model: string, system: string, user: string }): Promise<ClaudeResult> {
  if (!apiKey) throw new PermanentError('Claude is not configured (NUXT_ANTHROPIC_API_KEY is empty)')

  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 45_000 })
  const useFallbacks = FALLBACK_MODELS.has(model)

  let response: Anthropic.Beta.BetaMessage
  try {
    response = await client.beta.messages.create({
      model,
      // Deliberately capped: replies are under 150 words, and this bounds the
      // cost of any one call (the route reserves this much budget up front).
      max_tokens: MAX_OUTPUT_TOKENS,
      // Short, well-specified tasks: low effort keeps latency and cost down.
      output_config: { effort: 'low' },
      ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      system,
      messages: [{ role: 'user', content: user }],
    })
  }
  catch (error) {
    throw mapClaudeError(error)
  }

  if (response.stop_reason === 'refusal') throw new PermanentError('Claude declined this request')

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim()
  if (!text) throw new PermanentError('Claude returned no text')

  const usage = response.usage
  return {
    text,
    model: response.model,
    inputTokens: usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
    fellBack: (usage.iterations ?? []).some(entry => entry.type === 'fallback_message'),
  }
}

/** SDK errors → OpsHub's retry classification. Messages never include response bodies. */
export function mapClaudeError(error: unknown): Error {
  if (error instanceof Anthropic.APIConnectionError) {
    return new RetryableError('Could not reach the Claude API')
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status
    if (status === 408 || status === 409 || status === 429 || (status ?? 0) >= 500) {
      return new RetryableError(`Claude API responded ${status}`, { httpStatus: status, retryAfterMs: parseRetryAfter(error.headers?.get('retry-after')) })
    }
    return new PermanentError(`Claude API responded ${status}`, { httpStatus: status })
  }
  return error instanceof Error ? error : new Error(String(error))
}
