<script setup lang="ts">
import type { Database } from '~~/shared/types/database.types'

useSeoMeta({ title: 'Settings · OpsHub' })

const supabase = useSupabaseClient<Database>()
const { current, orgId, ready } = useOrg()
// Load the org before querying by it (see useOrg).
await ready

// RLS returns only members of orgs the viewer belongs to.
const { data: members } = useAsyncData(
  'org-members',
  async () => {
    if (!orgId.value) return []
    const { data, error } = await supabase
      .from('memberships')
      .select('user_id, role, created_at')
      .eq('org_id', orgId.value)
      .order('created_at')
    if (error) throw error
    return data
  },
  { watch: [orgId], default: () => [] },
)
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl space-y-6">
        <UPageCard
          title="Organization"
          variant="subtle"
        >
          <dl class="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt class="text-muted">
              Name
            </dt>
            <dd>{{ current?.org.name }}</dd>
            <dt class="text-muted">
              Slug
            </dt>
            <dd class="font-mono">
              {{ current?.org.slug }}
            </dd>
            <dt class="text-muted">
              Your role
            </dt>
            <dd class="capitalize">
              {{ current?.role }}
            </dd>
          </dl>
        </UPageCard>

        <UPageCard
          title="Members"
          :description="`${members.length} member${members.length === 1 ? '' : 's'}`"
          variant="subtle"
        >
          <ul class="divide-y divide-default text-sm">
            <li
              v-for="m in members"
              :key="m.user_id"
              class="flex items-center justify-between py-2"
            >
              <span class="font-mono text-xs text-muted">{{ m.user_id }}</span>
              <UBadge
                :label="m.role"
                variant="subtle"
                class="capitalize"
              />
            </li>
          </ul>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
