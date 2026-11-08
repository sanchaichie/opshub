import { describe, expect, it } from 'vitest'
import { checkFileAccess } from '../../.claude/hooks/lib/file-rules.mjs'

const projectDir = '/work/opshub'
const check = (tool: string, rel: string, content = '', isCommittedMigration = false) =>
  checkFileAccess({ tool, filePath: `${projectDir}/${rel}`, projectDir, content, isCommittedMigration }).decision

// Fake credentials are assembled at runtime so this file itself never
// contains a string that looks like a real secret.
const fake = (prefix: string, body = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6') => prefix + body

describe('.env files', () => {
  it.each(['.env', '.env.local', '.env.production', 'nested/.env'])('blocks %s', (rel) => {
    expect(check('Read', rel)).toBe('deny')
    expect(check('Write', rel)).toBe('deny')
  })

  it('allows .env.example', () => {
    expect(check('Read', '.env.example')).toBe('allow')
    expect(check('Write', '.env.example', 'STRIPE_SECRET_KEY=')).toBe('allow')
  })
})

describe('migrations', () => {
  const file = 'supabase/migrations/20260101000000_init.sql'

  it('blocks editing a committed migration', () => {
    expect(check('Edit', file, 'alter table x', true)).toBe('deny')
  })

  it('allows editing a new, uncommitted migration', () => {
    expect(check('Edit', file, 'alter table x', false)).toBe('allow')
  })

  it('allows reading any migration', () => {
    expect(check('Read', file, '', true)).toBe('allow')
  })
})

describe('secrets in content', () => {
  it.each([
    fake('sk_' + 'test_'),
    fake('sk_' + 'live_'),
    fake('whsec' + '_'),
    fake('sb_' + 'secret_'),
    fake('sk-' + 'ant-api03-'),
    fake('xo' + 'xb-123-'),
    fake('EZ' + 'TK'),
    fake('gh' + 'o_'),
    fake('GOC' + 'SPX-'),
    ['eyJ' + 'hbGciOiJIUzI1NiJ9', 'eyJ' + 'yb2xlIjoic2VydmljZV9yb2xlIn0', 'abcdefghijklmnop'].join('.'),
  ])('blocks writing a credential (%#)', (secret) => {
    expect(check('Write', 'server/utils/x.ts', `const k = '${secret}'`)).toBe('deny')
  })

  it('allows reading credentials from runtime config', () => {
    expect(check('Write', 'server/utils/x.ts', 'const { stripeSecretKey } = useRuntimeConfig()')).toBe('allow')
  })
})

describe('client bundle', () => {
  it.each([
    'const sb = serverSupabaseServiceRole(event)',
    'import { x } from \'~~/server/utils/secrets\'',
    'const k = process.env.STRIPE_SECRET_KEY',
    'const s = useRuntimeConfig().cronSecret',
  ])('blocks server-only code in app/: %s', (content) => {
    expect(check('Write', 'app/pages/index.vue', content)).toBe('deny')
  })

  it('allows public runtime config in app/', () => {
    expect(check('Write', 'app/pages/index.vue', 'const url = useRuntimeConfig().public.siteUrl')).toBe('allow')
  })

  it('allows server-only code in server/', () => {
    expect(check('Write', 'server/api/x.ts', 'const sb = serverSupabaseServiceRole(event)')).toBe('allow')
  })
})
