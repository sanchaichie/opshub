#!/usr/bin/env node
// Stop: don't let a turn end with a broken build. If code changed, run lint,
// typecheck and unit tests (plus pgTAP when SQL changed and the local stack is
// up). On failure, block the stop and hand the errors back to Claude.

import { projectDir, readEvent, run, tail } from './lib/io.mjs'

const event = await readEvent()
// Already continuing because of this hook: let it stop instead of looping.
if (event.stop_hook_active) process.exit(0)

const root = projectDir()
const status = run('git', ['status', '--porcelain'], { cwd: root })
if (!status.ok) process.exit(0)

const changed = status.output.split('\n').map(l => l.slice(3).trim()).filter(Boolean)
const codeChanged = changed.some(f => /\.(ts|mts|mjs|js|vue|json)$/.test(f) || f.endsWith('/'))
const sqlChanged = changed.some(f => /^supabase\/.+\.sql$/.test(f) || f === 'supabase/')

const checks = []
if (codeChanged) {
  checks.push(['lint', ['lint']], ['typecheck', ['typecheck']], ['unit tests', ['exec', 'vitest', 'run']])
}
if (sqlChanged && run('bash', ['scripts/assert-local-db.sh'], { cwd: root }).ok) {
  checks.push(['pgTAP', ['db:test']])
}

const failures = []
for (const [name, args] of checks) {
  const result = run('pnpm', args, { cwd: root })
  if (!result.ok) failures.push(`── ${name} failed ──\n${tail(result.output, 30)}`)
}

if (failures.length) {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: `Checks failed on the changed code. Fix these before finishing:\n\n${failures.join('\n\n')}`,
  }))
}
