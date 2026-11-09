/**
 * Errors that integrations throw to tell the worker what to do next.
 *
 * The worker never guesses from an error message: an action either throws one
 * of these, or (for anything unexpected) the error is treated as retryable,
 * because a transient bug fixed by a redeploy should not lose the job.
 */

/** Worth trying again later: timeouts, 5xx, 429, network failures. */
export class RetryableError extends Error {
  override readonly name = 'RetryableError'

  constructor(
    message: string,
    readonly details: { httpStatus?: number, retryAfterMs?: number, response?: unknown } = {},
  ) {
    super(message)
  }
}

/** Retrying can't help: bad input, 4xx other than 408/429, missing connection. */
export class PermanentError extends Error {
  override readonly name = 'PermanentError'

  constructor(
    message: string,
    readonly details: { httpStatus?: number, response?: unknown } = {},
  ) {
    super(message)
  }
}

/** Retryable unless the action explicitly said otherwise. */
export function isPermanent(error: unknown): error is PermanentError {
  return error instanceof PermanentError
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}
