<script setup lang="ts">
import type { Database, Enums } from '~~/shared/types/database.types'

useSeoMeta({ title: 'Events · OpsHub' })

const supabase = useSupabaseClient<Database>()
const { orgId, ready } = useOrg()
// Load the org before querying by it (see useOrg).
await ready
const route = useRoute()
const router = useRouter()

const ALL = 'all'
const filters = reactive({
  provider: String(route.query.provider ?? ALL),
  direction: String(route.query.direction ?? ALL),
  status: String(route.query.status ?? ALL),
})

// Keep filters in the URL so a filtered view can be shared or bookmarked.
watch(filters, (f) => {
  router.replace({ query: Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ALL)) })
})

const { data: events, refresh, status } = useAsyncData(
  'events',
  async () => {
    if (!orgId.value) return []
    let query = supabase
      .from('events')
      .select('id, provider, type, direction, status, attempts, error, created_at, updated_at')
      .eq('org_id', orgId.value)
      .order('created_at', { ascending: false })
      .limit(200)
    if (filters.provider !== ALL) query = query.eq('provider', filters.provider)
    if (filters.direction !== ALL) query = query.eq('direction', filters.direction as Enums<'event_direction'>)
    // "failed" in the UI means anything needing attention.
    if (filters.status === 'failed') query = query.in('status', ['failed', 'dead'])
    else if (filters.status !== ALL) query = query.eq('status', filters.status as Enums<'event_status'>)
    const { data, error } = await query
    if (error) throw error
    return data
  },
  { watch: [orgId, () => ({ ...filters })], default: () => [] },
)
useRealtime('events', orgId, () => refresh())

const option = (value: string, label = humanize(value)) => ({ label, value })
const providerOptions = [option(ALL, 'All providers'), ...Object.entries(providers).map(([id, p]) => option(id, p.label))]
const directionOptions = [option(ALL, 'Any direction'), option('inbound'), option('outbound'), option('internal')]
const statusOptions = [option(ALL, 'Any status'), option('failed', 'Failed or dead'), option('pending'), option('processing'), option('succeeded'), option('ignored')]
</script>

<template>
  <UDashboardPanel id="events">
    <template #header>
      <UDashboardNavbar title="Events">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <div class="flex flex-wrap gap-2">
          <USelect
            v-model="filters.provider"
            :items="providerOptions"
            class="w-40"
            aria-label="Provider"
          />
          <USelect
            v-model="filters.direction"
            :items="directionOptions"
            class="w-40"
            aria-label="Direction"
          />
          <USelect
            v-model="filters.status"
            :items="statusOptions"
            class="w-40"
            aria-label="Status"
          />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div
        v-if="status === 'pending' && !events.length"
        class="text-muted text-sm"
      >
        Loading…
      </div>
      <EventsEventFeed
        v-else
        :events="events"
      />
    </template>
  </UDashboardPanel>
</template>
