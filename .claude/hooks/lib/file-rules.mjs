// Rules for the PreToolUse Read/Edit/Write guard. Pure functions: the caller
// passes in whether a migration is already committed, so these are unit-testable
// without git (tests/hooks/file-rules.test.ts).

import path from 'node:path'

/** @typedef {{ decision: 'allow' | 'deny', reason?: string }} Verdict */

const ALLOW = /** @type {Verdict} */ ({ decision: 'allow' })
const deny = reason => /** @type {Verdict} */ ({ decision: 'deny', reason })

/**
 * Credential formats for every provider this project talks to. Matching any of
 * them in written content blocks the write: real keys belong in .env only.
 * Tests build fake keys by string concatenation so they don't trip this rule.
 */
export const SECRET_PATTERNS = [
  ['Stripe secret key', /\b[sr]k_(live|test)_[A-Za-z0-9]{16,}/],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{16,}/],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{16,}/],
  ['JWT (e.g. Supabase service_role key)', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['Slack token', /\bxox[abpres]-[A-Za-z0-9-]{10,}/],
  ['HubSpot private app token', /\bpat-(na|eu)\d*-[a-f0-9-]{20,}/],
  ['EasyPost API key', /\bEZ[AT]K[a-zA-Z0-9]{20,}/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}/],
  ['Google OAuth client secret', /\bGOCSPX-[A-Za-z0-9_-]{20,}/],
  ['Private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

/** Things that must never be imported or referenced from client code. */
const SERVER_ONLY_IN_CLIENT = [
  [/serverSupabase(ServiceRole|Client|User|Session)/, 'server-only Supabase helpers'],
  [/\b(NUXT_)?SUPABASE_(SECRET|SERVICE)(_ROLE)?_KEY\b/, 'the Supabase secret key'],
  [/from\s+['"](~~\/server|#server|\.\.\/+server)\b/, 'code under server/'],
  [/\bprocess\.env\b/, 'process.env (use useRuntimeConfig().public instead)'],
  [/useRuntimeConfig\(\)\.(?!public\b)\w+/, 'private runtimeConfig values'],
]

/** @param {string} p */
const isEnvFile = (p) => {
  const base = path.basename(p)
  return /^\.env(\..+)?$/.test(base) && base !== '.env.example'
}

/**
 * @param {{
 *   tool: string,
 *   filePath: string,           // absolute
 *   projectDir: string,         // absolute
 *   content?: string,           // text being written (Write content / Edit new_string)
 *   isCommittedMigration?: boolean,
 * }} input
 * @returns {Verdict}
 */
export function checkFileAccess({ tool, filePath, projectDir, content = '', isCommittedMigration = false }) {
  const rel = path.relative(projectDir, filePath)
  const writing = tool !== 'Read'

  if (isEnvFile(filePath)) {
    return deny(`${path.basename(filePath)} holds real secrets and is off-limits to Claude. Edit .env.example for key names; the user fills in values.`)
  }

  if (!writing) return ALLOW

  if (/^supabase\/migrations\/.+\.sql$/.test(rel) && isCommittedMigration) {
    return deny(`${rel} is already committed, so it may have run somewhere. Never edit an applied migration: create a new one with the new-migration skill.`)
  }

  for (const [name, re] of SECRET_PATTERNS) {
    if (re.test(content)) {
      return deny(`The content contains what looks like a real ${name}. Secrets go in .env only, read via useRuntimeConfig() on the server.`)
    }
  }

  if (/^(app|shared)\//.test(rel)) {
    for (const [re, what] of SERVER_ONLY_IN_CLIENT) {
      if (re.test(content)) {
        return deny(`${rel} is client-side code and must not reference ${what}. Put this logic in a server route.`)
      }
    }
  }

  return ALLOW
}
