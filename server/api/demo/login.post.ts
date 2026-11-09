import { randomBytes } from 'node:crypto'
import { serverSupabaseClient } from '#supabase/server'
import { DEMO_ORG_ID } from '~~/shared/demo'

/**
 * "Try demo": gives this visitor their own throwaway account inside the shared
 * demo org, and signs them in (ADR 0007).
 *
 * Why not one shared demo account: with a shared account, any visitor could
 * sign out every other visitor (Supabase's sign-out revokes all of a user's
 * sessions) or change its password or email. With one account per visitor,
 * those actions only ever affect the visitor themselves.
 *
 * The account's password is random, used once right here to sign in, and
 * never stored or sent anywhere: the visitor only receives a session cookie.
 * Visitor accounts are deleted by the nightly reset after a day.
 */
export default defineEventHandler(async (event) => {
  // The route needs no cookie, so SameSite doesn't protect it: refuse
  // cross-site requests, or another site could swap a user into the demo.
  const origin = getHeader(event, 'origin')
  if (origin && origin !== useRuntimeConfig(event).public.siteUrl) {
    throw createError({ statusCode: 403, statusMessage: 'Cross-site request refused' })
  }

  // Each call creates an account, so cap both per visitor and overall.
  await enforceRateLimits(event, [
    { key: `demo-login:ip:${clientIp(event)}`, max: 10, window: '1 hour' },
    { key: 'demo-login:global', max: 1000, window: '1 day' },
  ], 'Too many demo sign-ins. Try again later.')

  const db = useServiceClient(event)
  const email = `visitor-${randomBytes(6).toString('hex')}@demo.example.com`
  const password = randomBytes(24).toString('base64url')

  const { data: created, error: createError_ } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // app_metadata can't be changed by the user; the nightly purge keys on it.
    app_metadata: { demo: true },
    user_metadata: { full_name: 'Demo visitor' },
  })
  if (createError_ || !created.user) {
    console.error('[demo] could not create a visitor account', createError_?.message)
    throw createError({ statusCode: 503, statusMessage: 'The demo is temporarily unavailable' })
  }
  const userId = created.user.id

  const { error: memberError } = await db
    .from('memberships')
    .insert({ org_id: DEMO_ORG_ID, user_id: userId, role: 'member' })
  if (memberError) throw memberError

  await removePersonalWorkspace(db, userId)

  const { error } = await (await serverSupabaseClient(event)).auth.signInWithPassword({ email, password })
  if (error) {
    console.error('[demo] sign-in failed for a fresh visitor account', error.message)
    throw createError({ statusCode: 503, statusMessage: 'The demo is temporarily unavailable' })
  }

  return { orgId: DEMO_ORG_ID }
})

/**
 * The sign-up trigger gives every new user a personal workspace. GoTrue's
 * admin createUser sets app_metadata after inserting the user, so the trigger
 * can't tell this is a demo visitor; remove that workspace here. Scoped to
 * non-demo orgs this brand-new user owns, i.e. exactly that one workspace.
 * (If this ever fails, the nightly reset sweeps it.)
 */
async function removePersonalWorkspace(db: ReturnType<typeof useServiceClient>, userId: string) {
  const { data: owned, error } = await db
    .from('memberships')
    .select('org_id, organizations!inner(is_demo)')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .eq('organizations.is_demo', false)
  if (error) throw error
  if (!owned.length) return

  const { error: deleteError } = await db.from('organizations').delete().in('id', owned.map(m => m.org_id))
  if (deleteError) throw deleteError
}
