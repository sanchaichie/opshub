import { describe, expect, it } from 'vitest'
import { checkCommand } from '../../.claude/hooks/lib/bash-rules.mjs'

const projectDir = '/work/opshub'
const verdict = (cmd: string, cwd = projectDir) => checkCommand(cmd, { cwd, projectDir }).decision

describe('database reset', () => {
  it.each([
    'supabase db reset --linked',
    'supabase db reset --db-url postgres://x',
    'echo hi && supabase db reset --linked',
    'npx supabase db reset --linked',
    'pnpm dlx supabase@2.1.0 db reset --db-url "postgres://u:p@db.x.supabase.co:5432/postgres"',
    'bash -c "$(echo ok); supabase db reset --linked"',
  ])('denies remote reset: %s', (cmd) => {
    expect(verdict(cmd)).toBe('deny')
  })

  it('redirects a plain local reset to pnpm db:reset', () => {
    const v = checkCommand('supabase db reset', { cwd: projectDir, projectDir })
    expect(v.decision).toBe('deny')
    expect(v.reason).toContain('pnpm db:reset')
  })

  it('allows the safe reset script', () => {
    expect(verdict('pnpm db:reset')).toBe('allow')
  })
})

describe('destructive SQL', () => {
  it.each([
    'psql "postgresql://postgres:pw@db.abc.supabase.co:5432/postgres" -c "drop table orders"',
    'psql -h aws-0-us-east-1.pooler.supabase.com -c "TRUNCATE events"',
    'psql postgres://u:p@prod.example.com/db -c "delete from orders;"',
    'pg_restore -h db.abc.supabase.co dump.sql',
    'psql "postgres://postgres:postgres@127.0.0.1:56322/postgres" -c "drop database postgres"',
    'psql -c "DROP SCHEMA public CASCADE"',
  ])('denies %s', (cmd) => {
    expect(verdict(cmd)).toBe('deny')
  })

  it('asks before any non-destructive remote connection', () => {
    expect(verdict('psql -h db.abc.supabase.co -c "select 1"')).toBe('ask')
  })

  it('allows destructive SQL on the local stack', () => {
    expect(verdict('psql "postgresql://postgres:postgres@127.0.0.1:56322/postgres" -c "truncate events"')).toBe('allow')
  })
})

describe('gated remote operations', () => {
  it.each([
    'supabase db push',
    'supabase migration repair --status reverted 2024',
    'supabase link --project-ref abc',
    'vercel deploy --prod',
    'git push --force origin feature/x',
    'git reset --hard HEAD~1',
  ])('asks: %s', (cmd) => {
    expect(verdict(cmd)).toBe('ask')
  })

  it.each([
    'git push --force origin main',
    'git push -f origin master',
    'stripe trigger payment_intent.succeeded --live',
  ])('denies: %s', (cmd) => {
    expect(verdict(cmd)).toBe('deny')
  })
})

describe('secrets', () => {
  it.each([
    'cat .env',
    'cat ./.env.local',
    'grep STRIPE .env.production',
    'source .env && pnpm dev',
    'printenv',
    'env | grep KEY',
    'echo $STRIPE_SECRET_KEY',
    'echo "${NUXT_SUPABASE_SECRET_KEY}"',
    'gh auth token',
  ])('denies %s', (cmd) => {
    expect(verdict(cmd)).toBe('deny')
  })

  it.each([
    'cat .env.example',
    'cp .env.example .env.example.bak',
    'GH_TOKEN=$(gh auth token -u sanchaichie) gh repo view',
    'env NODE_ENV=test pnpm test',
    'echo $NODE_ENV',
  ])('allows %s', (cmd) => {
    expect(verdict(cmd)).toBe('allow')
  })
})

describe('recursive delete', () => {
  it.each([
    'rm -rf /',
    'rm -rf ~',
    'rm -rf ~/Documents',
    'rm -rf $HOME',
    'rm -rf ../other-project',
    'rm -rf .',
    'rm -rf .git',
    'rm -rf supabase/migrations',
    'rm -fr docs/plan',
  ])('denies %s', (cmd) => {
    expect(verdict(cmd)).toBe('deny')
  })

  it.each([
    'rm -rf node_modules .nuxt .output',
    'rm -rf ./dist',
    'rm file.txt',
  ])('allows %s', (cmd) => {
    expect(verdict(cmd)).toBe('allow')
  })
})

describe('everyday commands pass through', () => {
  it.each([
    'pnpm dev',
    'pnpm lint && pnpm typecheck',
    'supabase status',
    'supabase migration new create_orders',
    'stripe listen --forward-to localhost:3000/api/webhooks/stripe',
    'git status',
    'git push origin feature/x',
  ])('%s', (cmd) => {
    expect(verdict(cmd)).toBe('allow')
  })
})
