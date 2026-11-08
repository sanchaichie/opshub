// Shared plumbing for hook entrypoints: read the JSON event from stdin and
// write the JSON response Claude Code expects.

import { execFileSync } from 'node:child_process'

export async function readEvent() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  return JSON.parse(raw || '{}')
}

export const projectDir = () => process.env.CLAUDE_PROJECT_DIR || process.cwd()

/** Reply to a PreToolUse event with allow / ask / deny. */
export function preToolUse(decision, reason) {
  if (decision === 'allow') process.exit(0) // defer to normal permission rules
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }))
  process.exit(0)
}

/** Run a command, returning { ok, output } instead of throwing. */
export function run(cmd, args, opts = {}) {
  try {
    const output = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    return { ok: true, output }
  }
  catch (err) {
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}` || String(err.message) }
  }
}

/** Keep feedback short enough to be useful in the transcript. */
export const tail = (text, lines = 40) => text.trim().split('\n').slice(-lines).join('\n')
