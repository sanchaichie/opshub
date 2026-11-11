import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { generate, MAX_OUTPUT_TOKENS } from '../../../integrations/claude/client'
import { orderContext } from '../../../integrations/claude/context'
import { REPLY_SYSTEM, replyPrompt, SUMMARY_SYSTEM, summaryPrompt } from '../../../integrations/claude/prompts'
import { errorMessage, RetryableError } from '../../../lib/errors'
import { recordSyncCall } from '../../../lib/event-log'

const params = z.object({ id: z.uuid() })
const body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('summary') }),
  z.object({ kind: z.literal('reply_draft'), customerMessage: z.string().trim().min(1).max(4_000) }),
])

/**
 * Budget reserved before each call: a generous input estimate plus the
 * output cap. Reserving up front means concurrent requests and failed or
 * refused calls (which are still billed) all count against the cap.
 */
const RESERVE_TOKENS = 3_000 + MAX_OUTPUT_TOKENS

/**
 * AI assist: summarize an order, or draft a reply to a customer message.
 * Synchronous (a person is waiting), logged as an outbound event with token
 * usage, and capped by request count (per IP in the demo, per org otherwise) and by a
 * daily token budget per org (one shared budget for the demo, so demo
 * traffic can't use up a real org's budget).
 */
export default defineEventHandler(async (event) => {
  await requireUserId(event)
  const { id } = await getValidatedRouterParams(event, params.parse)
  const input = await readValidatedBody(event, body.parse)

  const db = useServiceClient(event)
  const loaded = await orderContext(db, id)
  // "Not a member" looks the same as "doesn't exist": no probing for order ids.
  const membership = loaded ? await requireOrgRole(event, loaded.orgId).catch(() => null) : null
  if (!loaded || !membership) throw createError({ statusCode: 404, statusMessage: 'Order not found' })

  const config = useRuntimeConfig(event)
  await enforceRateLimits(event, [
    membership.isDemo
      ? { key: `ai:ip:${clientIp(event)}`, max: 10, window: '1 day' }
      : { key: `ai:org:${loaded.orgId}`, max: 200, window: '1 day' },
  ], 'AI request limit reached for today.')

  // Separate budgets: demo traffic can never use up a real org's AI budget.
  const tokensKey = membership.isDemo ? 'tokens:ai:demo' : `tokens:ai:org:${loaded.orgId}`
  const cap = Number(config.aiDailyTokenCap) || 0
  const { data: reserved, error: reserveError } = await db.rpc('add_usage', { counter_key: tokensKey, window_size: '1 day', amount: RESERVE_TOKENS })
  if (reserveError) throw createError({ statusCode: 500, statusMessage: 'Could not check AI usage' })
  if (cap > 0 && (reserved ?? 0) > cap) {
    throw createError({ statusCode: 429, statusMessage: 'The AI budget for today is used up. Try again tomorrow.' })
  }

  const prompt = input.kind === 'summary'
    ? { system: SUMMARY_SYSTEM, user: summaryPrompt(loaded.context) }
    : { system: REPLY_SYSTEM, user: replyPrompt(loaded.context, input.customerMessage) }

  const startedAt = new Date()
  // The event log is visible to every org member (and every demo visitor):
  // record the request's shape, never the customer's message itself.
  const call = {
    orgId: loaded.orgId,
    orderId: id,
    provider: 'claude',
    action: input.kind,
    idempotencyKey: `claude.${input.kind}:${randomUUID()}`,
    input: { kind: input.kind, model: config.anthropicModel, ...(input.kind === 'reply_draft' ? { customer_message_chars: input.customerMessage.length } : {}) },
    startedAt,
  }

  let result
  try {
    result = await generate({ apiKey: config.anthropicApiKey, model: config.anthropicModel, ...prompt })
  }
  catch (error) {
    await recordSyncCall(db, { ...call, outcome: { ok: false, error: errorMessage(error) } })
    if (error instanceof RetryableError) {
      const seconds = error.details.retryAfterMs ? Math.ceil(error.details.retryAfterMs / 1000) : 30
      setResponseHeader(event, 'Retry-After', seconds)
      throw createError({ statusCode: 503, statusMessage: 'Claude is busy right now. Try again in a moment.' })
    }
    throw createError({ statusCode: 502, statusMessage: /not configured/.test(errorMessage(error)) ? 'AI isn\'t configured on this server yet.' : 'Claude couldn\'t answer this one.' })
  }

  // Settle: the reservation already counted RESERVE_TOKENS; add any excess.
  // (A smaller real usage stays over-counted: conservative, and simpler than
  // allowing negative adjustments.)
  const excess = Math.max(0, result.inputTokens + result.outputTokens - RESERVE_TOKENS)
  const [{ error: addError }, { data: saved, error: saveError }] = await Promise.all([
    db.rpc('add_usage', { counter_key: tokensKey, window_size: '1 day', amount: excess }),
    db.from('ai_outputs').insert({
      org_id: loaded.orgId,
      order_id: id,
      kind: input.kind,
      model: result.model,
      content: result.text,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      created_by: membership.userId,
    }).select('id, kind, model, content, input_tokens, output_tokens, created_at').single(),
  ])
  if (addError) console.error('[ai] could not record token usage', addError.message)
  if (saveError) throw createError({ statusCode: 500, statusMessage: 'Could not save the result' })

  await recordSyncCall(db, {
    ...call,
    outcome: { ok: true, httpStatus: 200, response: { output_id: saved.id, model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens, fell_back: result.fellBack } },
  })

  return saved
})
