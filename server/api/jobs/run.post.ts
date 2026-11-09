/**
 * The queue worker. pg_cron calls this every minute (Bearer CRON_SECRET), and
 * it can be triggered by hand the same way. Processes a few batches within a
 * time budget, so one call drains a small backlog without hitting the
 * serverless timeout.
 */
// Leaves headroom under the 60s maxDuration even if the last batch is slow.
const TIME_BUDGET_MS = 30_000
const MAX_BATCHES = 5

export default defineEventHandler(async (event) => {
  if (!isCronRequest(event)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const started = Date.now()
  const total = { claimed: 0, succeeded: 0, retrying: 0, dead: 0, batches: 0 }

  while (total.batches < MAX_BATCHES && Date.now() - started < TIME_BUDGET_MS) {
    const summary = await runWorker(event, 10)
    total.batches++
    total.claimed += summary.claimed
    total.succeeded += summary.succeeded
    total.retrying += summary.retrying
    total.dead += summary.dead
    if (summary.claimed === 0) break
  }

  return total
})
