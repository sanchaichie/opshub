#!/usr/bin/env node
// PreToolUse(Read|Edit|MultiEdit|Write): protect .env files, applied
// migrations, and the client bundle. Fails closed.

import path from 'node:path'
import { checkFileAccess } from './lib/file-rules.mjs'
import { preToolUse, projectDir, readEvent, run } from './lib/io.mjs'

/** A migration counts as applied once it is in HEAD. */
function isCommitted(rel, cwd) {
  return run('git', ['cat-file', '-e', `HEAD:${rel}`], { cwd }).ok
}

function writtenContent(input) {
  if (typeof input.content === 'string') return input.content
  if (typeof input.new_string === 'string') return input.new_string
  if (Array.isArray(input.edits)) return input.edits.map(e => e.new_string ?? '').join('\n')
  return ''
}

try {
  const event = await readEvent()
  const input = event.tool_input ?? {}
  const root = projectDir()
  const filePath = path.resolve(root, input.file_path ?? input.notebook_path ?? '')
  const rel = path.relative(root, filePath)

  const verdict = checkFileAccess({
    tool: event.tool_name,
    filePath,
    projectDir: root,
    content: writtenContent(input),
    isCommittedMigration: rel.startsWith('supabase/migrations/') && isCommitted(rel, root),
  })
  preToolUse(verdict.decision, verdict.reason)
}
catch (err) {
  preToolUse('deny', `guard-files failed (${err.message}); denying to be safe.`)
}
