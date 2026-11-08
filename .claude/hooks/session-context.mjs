#!/usr/bin/env node
// SessionStart: tell Claude where it is: branch, which DB is local vs remote,
// and the current phase/task from docs/plan.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { projectDir, run } from './lib/io.mjs'

const root = projectDir()
const lines = ['# OpsHub session context']

const branch = run('git', ['branch', '--show-current'], { cwd: root })
const dirty = run('git', ['status', '--porcelain'], { cwd: root })
lines.push(`- Git: branch \`${branch.output.trim() || '(none yet)'}\`, ${dirty.output.split('\n').filter(Boolean).length} changed file(s)`)

const local = run('bash', ['scripts/assert-local-db.sh'], { cwd: root })
const port = local.output.match(/port (\d+)/)?.[1]
lines.push(`- Local Supabase: ${local.ok ? `running (127.0.0.1:${port})` : 'not running (`pnpm db:start`)'}`)

const refFile = path.join(root, 'supabase/.temp/project-ref')
const ref = existsSync(refFile) ? readFileSync(refFile, 'utf8').trim() : null
lines.push(`- Linked remote project: ${ref ? `\`${ref}\` (PRODUCTION: never reset; migrations go out via CI)` : 'none'}`)

/** Find docs with `status: in-progress` in their frontmatter. */
function inProgress(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true })
    .filter(f => String(f).endsWith('.md'))
    .map(f => path.join(dir, String(f)))
    .filter(f => /^status:\s*in-progress\s*$/m.test(readFileSync(f, 'utf8').split('\n---')[0]))
    .map(f => path.relative(root, f))
}

const phases = inProgress(path.join(root, 'docs/plan/phases'))
const tasks = inProgress(path.join(root, 'docs/plan/tasks'))
lines.push(`- Current phase: ${phases.join(', ') || 'none in progress'}`)
lines.push(`- Tasks in progress: ${tasks.join(', ') || 'none (use the phase-start skill or pick the next planned task)'}`)

process.stdout.write(lines.join('\n') + '\n')
