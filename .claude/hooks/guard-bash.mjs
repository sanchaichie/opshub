#!/usr/bin/env node
// PreToolUse(Bash): block or gate dangerous shell commands. Fails closed: if
// this script itself errors, the command is denied rather than let through.

import { checkCommand } from './lib/bash-rules.mjs'
import { preToolUse, projectDir, readEvent } from './lib/io.mjs'

try {
  const event = await readEvent()
  const verdict = checkCommand(event.tool_input?.command ?? '', {
    cwd: event.cwd || projectDir(),
    projectDir: projectDir(),
  })
  preToolUse(verdict.decision, verdict.reason)
}
catch (err) {
  preToolUse('deny', `guard-bash failed (${err.message}); denying to be safe.`)
}
