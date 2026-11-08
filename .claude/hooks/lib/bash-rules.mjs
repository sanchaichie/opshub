// Rules for the PreToolUse Bash guard. Pure functions: no I/O, so every rule is
// unit-tested in tests/hooks/bash-rules.test.ts.
//
// Rules match against the whole command string (not just its first word), so
// chained commands (`a && b`), subshells (`$(...)`) and wrappers
// (`npx supabase ...`, `pnpm dlx supabase ...`) are caught too.

import path from 'node:path'

/** @typedef {{ decision: 'allow' | 'ask' | 'deny', reason?: string }} Verdict */

const ALLOW = /** @type {Verdict} */ ({ decision: 'allow' })
const deny = reason => /** @type {Verdict} */ ({ decision: 'deny', reason })
const ask = reason => /** @type {Verdict} */ ({ decision: 'ask', reason })

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'])
const DESTRUCTIVE_SQL = /\b(drop\s+(table|schema|database|function|policy|type|view|extension)|truncate|alter\s+table\s+\S+\s+drop|delete\s+from\s+[\w."]+\s*(;|$|'|"))/i

// `supabase` optionally pinned to a version, e.g. `npx supabase@2 db reset`.
const SUPABASE = String.raw`\bsupabase(?:@[\w.^~-]+)?`

/** Each rule returns a Verdict when it matches, or null. First match wins. */
const RULES = [
  // ── Database: never reset or destroy a remote database ──────────────────
  (cmd) => {
    if (!new RegExp(`${SUPABASE}\\s+db\\s+reset\\b`).test(cmd)) return null
    if (/--linked\b|--db-url\b/.test(cmd)) {
      return deny('Resetting a remote Supabase database is never allowed. Only the local stack can be reset, via `pnpm db:reset`.')
    }
    return deny('Use `pnpm db:reset` instead of calling `supabase db reset` directly. The script first proves the target is the local stack.')
  },
  cmd => new RegExp(`${SUPABASE}\\s+projects\\s+delete\\b`).test(cmd)
    ? deny('Deleting a Supabase project is never done from this repo.')
    : null,
  cmd => /\bdrop\s+database\b/i.test(cmd)
    ? deny('DROP DATABASE is never allowed.')
    : null,
  cmd => /\bdrop\s+schema\s+(if\s+exists\s+)?"?(public|auth|storage|vault|cron|net|extensions|private|supabase_\w+)"?/i.test(cmd)
    ? deny('Dropping a core schema is never allowed.')
    : null,
  (cmd) => {
    // psql / pg_dump / pg_restore against anything that is not local.
    if (!/\b(psql|pg_dump|pg_restore|pgcli)\b/.test(cmd)) return null
    const hosts = [
      ...[...cmd.matchAll(/postgres(?:ql)?:\/\/[^@\s'"]*@([^:/\s'"?]+)/g)].map(m => m[1]),
      ...[...cmd.matchAll(/(?:\s-h\s*|--host[=\s])(\S+)/g)].map(m => m[1].replace(/['"]/g, '')),
      ...[...cmd.matchAll(/\bPGHOST=(\S+)/g)].map(m => m[1].replace(/['"]/g, '')),
    ]
    const remote = hosts.filter(h => !LOCAL_HOSTS.has(h))
    if (remote.length === 0) return null
    if (DESTRUCTIVE_SQL.test(cmd) || /\bpg_restore\b/.test(cmd)) {
      return deny(`Destructive SQL against a remote database (${remote.join(', ')}) is never allowed.`)
    }
    return ask(`This connects to a remote database (${remote.join(', ')}). Confirm it is intended.`)
  },
  cmd => /--linked\b/.test(cmd) && DESTRUCTIVE_SQL.test(cmd)
    ? deny('Destructive SQL against the linked (remote) project is never allowed.')
    : null,

  // ── Database: gated remote operations ───────────────────────────────────
  cmd => new RegExp(`${SUPABASE}\\s+db\\s+push\\b`).test(cmd)
    ? ask('`supabase db push` changes the remote database. Prod migrations normally go out through the db-migrate GitHub Action.')
    : null,
  cmd => new RegExp(`${SUPABASE}\\s+migration\\s+repair\\b`).test(cmd)
    ? ask('`supabase migration repair` rewrites remote migration history.')
    : null,
  cmd => new RegExp(`${SUPABASE}\\s+(link|unlink)\\b`).test(cmd)
    ? ask('Changing which remote project is linked.')
    : null,
  cmd => new RegExp(`${SUPABASE}\\s+stop\\b.*--no-backup`).test(cmd)
    ? ask('`supabase stop --no-backup` deletes all local database data.')
    : null,
  cmd => new RegExp(`${SUPABASE}\\s+secrets\\s+(set|unset)\\b`).test(cmd)
    ? ask('Changing remote Supabase secrets.')
    : null,

  // ── Payments: test mode only ────────────────────────────────────────────
  cmd => /\bstripe\b.*\s--live\b/.test(cmd)
    ? deny('Stripe live mode is never used from this repo. Test mode only.')
    : null,

  // ── Secrets: never print them into the transcript ───────────────────────
  (cmd) => {
    const envFile = /(?:^|[\s/'"=<])\.env(?:\.(?!example\b)[\w-]+)?(?=$|[\s'";|&)])/
    return envFile.test(cmd)
      ? deny('.env files hold real secrets and must not be read, printed or copied. Use .env.example for the list of keys.')
      : null
  },
  cmd => /(?:^|[;&|(]\s*)(printenv|env|export\s+-p|set)\s*(?:$|[;&|)])/.test(cmd)
    ? deny('Dumping the environment would print secrets (e.g. GH_TOKEN). Check a single non-secret variable instead.')
    : null,
  cmd => /\b(echo|printf)\b[^|;&]*\$\{?\w*(SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_KEY|API_KEY)\w*/i.test(cmd)
    ? deny('Printing a secret variable is not allowed.')
    : null,
  cmd => /(?<!\$\()\bgh\s+auth\s+token\b/.test(cmd)
    ? deny('`gh auth token` prints a credential. Use it only inside $(...) to pass it to another command.')
    : null,

  // ── Filesystem ──────────────────────────────────────────────────────────
  (cmd, ctx) => {
    for (const m of cmd.matchAll(/\brm\s+((?:-\w+\s+)*)(.+?)(?=$|[;&|])/g)) {
      const flags = m[1]
      if (!/-\w*[rR]/.test(flags)) continue
      const targets = m[2].trim().split(/\s+/).map(t => t.replace(/^['"]|['"]$/g, ''))
      for (const t of targets) {
        if (/^(\/|~|\$HOME|\*)$/.test(t) || t.startsWith('~') || t.startsWith('$HOME')) {
          return deny(`Recursive delete of ${t} is never allowed.`)
        }
        const abs = path.resolve(ctx.cwd, t)
        const rel = path.relative(ctx.projectDir, abs)
        if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
          return deny(`Recursive delete outside the project (${t}) is not allowed.`)
        }
        if (/^(\.git|supabase\/migrations|supabase$|docs\/plan)(\/|$)/.test(rel)) {
          return deny(`${rel} holds project history and must not be deleted.`)
        }
      }
    }
    return null
  },

  // ── Git ─────────────────────────────────────────────────────────────────
  (cmd) => {
    if (!/\bgit\s+push\b/.test(cmd)) return null
    const force = /\s(--force(-with-lease)?|-f)\b|\s\+\S+/.test(cmd)
    if (!force) return null
    return /\b(main|master)\b/.test(cmd)
      ? deny('Force-pushing main is never allowed.')
      : ask('Force push rewrites remote history.')
  },
  cmd => /\bgit\s+(reset\s+--hard|clean\s+-\w*f|checkout\s+--\s+\.|restore\s+(--\S+\s+)*\.)/.test(cmd)
    ? ask('This discards local changes permanently.')
    : null,

  // ── Deploys ─────────────────────────────────────────────────────────────
  cmd => /\bvercel\b.*(--prod\b|\bpromote\b|\brollback\b)/.test(cmd)
    ? ask('This changes the production deployment.')
    : null,
]

/**
 * @param {string} command
 * @param {{ cwd: string, projectDir: string }} ctx
 * @returns {Verdict}
 */
export function checkCommand(command, ctx) {
  const cmd = command.replace(/\\\n/g, ' ')
  for (const rule of RULES) {
    const verdict = rule(cmd, ctx)
    if (verdict) return verdict
  }
  return ALLOW
}
