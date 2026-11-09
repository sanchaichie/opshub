import type { Database, Enums } from '~~/shared/types/database.types'

export interface OrgMembership {
  role: Enums<'member_role'>
  org: { id: string, name: string, slug: string, isDemo: boolean }
}

/**
 * The organizations the signed-in user belongs to, and which one they're
 * working in. Reads go straight to Supabase: RLS returns only the user's own
 * memberships. The selected org is remembered in a cookie so SSR renders the
 * same org the user last picked.
 *
 * Pages that query by org should `await ready` first. Otherwise, during
 * server rendering, the org id is still null when their own query runs, and
 * since the value doesn't change after hydration, they never re-fetch.
 */
export function useOrg() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const selectedId = useCookie<string | null>('opshub-org', { sameSite: 'lax', default: () => null })

  const request = useAsyncData(
    'org-memberships',
    async (): Promise<OrgMembership[]> => {
      const userId = user.value?.sub
      if (!userId) return []

      const { data, error } = await supabase
        .from('memberships')
        .select('role, organizations!inner(id, name, slug, is_demo)')
        .eq('user_id', userId)
        .order('created_at')
      if (error) throw error

      return data.map(m => ({
        role: m.role,
        org: { id: m.organizations.id, name: m.organizations.name, slug: m.organizations.slug, isDemo: m.organizations.is_demo },
      }))
    },
    { watch: [() => user.value?.sub], default: () => [] },
  )
  const { data: memberships, status, refresh } = request

  const current = computed<OrgMembership | null>(() =>
    memberships.value.find(m => m.org.id === selectedId.value) ?? memberships.value[0] ?? null,
  )

  function select(orgId: string) {
    selectedId.value = orgId
  }

  return {
    memberships,
    current,
    orgId: computed(() => current.value?.org.id ?? null),
    isDemo: computed(() => current.value?.org.isDemo ?? false),
    loading: computed(() => status.value === 'pending'),
    select,
    refresh,
    /** Resolves once memberships have loaded. */
    ready: Promise.resolve(request).then(() => undefined),
  }
}
