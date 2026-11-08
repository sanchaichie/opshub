#!/usr/bin/env node
// PostToolUse(Edit|MultiEdit|Write): lint-fix the file just changed and feed any
// remaining errors back to Claude; remind about the migration workflow.

import path from 'node:path'
import { projectDir, readEvent, run, tail } from './lib/io.mjs'

const event = await readEvent()
const root = projectDir()
const filePath = path.resolve(root, event.tool_input?.file_path ?? '')
const rel = path.relative(root, filePath)

if (rel.startsWith('..') || /(^|\/)(node_modules|\.nuxt|\.output)\//.test(rel)) process.exit(0)

const notes = []

if (/\.(ts|mts|mjs|js|vue)$/.test(rel)) {
  const lint = run('pnpm', ['exec', 'eslint', '--fix', filePath], { cwd: root })
  if (!lint.ok) {
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: `ESLint errors remain in ${rel} after --fix:\n${tail(lint.output)}`,
    }))
    process.exit(0)
  }
}

if (/^supabase\/migrations\/.+\.sql$/.test(rel)) {
  notes.push(`Migration ${rel} changed. Next: run \`pnpm db:reset\` (applies it locally, runs pgTAP, regenerates types), then ask the migration-reviewer agent to review it.`)
}

if (notes.length) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n') },
  }))
}
