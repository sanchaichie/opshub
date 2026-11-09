import type { H3Event } from 'h3'
import { serverSupabaseUser } from '#supabase/server'
import type { Enums } from '~~/shared/types/database.types'
import { useServiceClient } from './events'

export type MemberRole = Enums<'member_role'>

export interface Membership {
  userId: string
  orgId: string
  role: MemberRole
  isDemo: boolean
}

/** The signed-in user's id, or a 401. Verified from the session JWT, not trusted from the client. */
export async function requireUserId(event: H3Event): Promise<string> {
  const claims = await serverSupabaseUser(event).catch(() => null)
  if (!claims?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }
  return claims.sub
}

/**
 * Every server route that touches org data starts here. The org id may come
 * from the request, but membership and role are looked up in the database,
 * so a user can't act on an org just by naming it.
 */
export async function requireOrgRole(
  event: H3Event,
  orgId: string,
  roles: readonly MemberRole[] = ['owner', 'admin', 'member'],
): Promise<Membership> {
  const userId = await requireUserId(event)

  const { data, error } = await useServiceClient(event)
    .from('memberships')
    .select('role, organizations!inner(is_demo)')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  // Same response for "not a member" and "wrong role": don't reveal which orgs exist.
  if (!data || !roles.includes(data.role)) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have access to this organization' })
  }

  return { userId, orgId, role: data.role, isDemo: data.organizations.is_demo }
}

/** Guard for actions the shared public demo must not perform (see ADR 0002). */
export function forbidInDemo(membership: Membership, action: string): void {
  if (membership.isDemo) {
    throw createError({ statusCode: 403, statusMessage: `${action} is disabled in the demo` })
  }
}
