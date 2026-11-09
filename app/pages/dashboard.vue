<script setup lang="ts">
import type { Database } from '~~/shared/types/database.types'

useSeoMeta({ title: 'Dashboard · OpsHub' })

const supabase = useSupabaseClient<Database>()
const { orgId, current, ready } = useOrg()
// Load the org before querying by it (see useOrg).
await ready
const since = () => new Date(Date.now() - 30 * 86_400_000).toISOString()

const { data: feed, refresh: refreshFeed } = useAsyncData(
  'dashboard-feed',
  async () => {
    if (!orgId.value) return []
    const { data, error } = await supabase
      .from('events')
      .select('id, provider, type, direction, status, attempts, error, created_at, updated_at')
      .eq('org_id', orgId.value)
      .order('updated_at', { ascending: false })
      .limit(15)
    if (error) throw error
    return data
  },
  { watch: [orgId], default: () => [] },
)

const { data: stats, refresh: refreshStats } = useAsyncData(
  'dashboard-stats',
  async () => {
    if (!orgId.value) return null
    const [orders, failing] = await Promise.all([
      supabase.from('orders').select('amount_cents, status').eq('org_id', orgId.value).gte('created_at', since()),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('org_id', orgId.value).in('status', ['failed', 'dead']),
    ])
    if (orders.error) throw orders.error
    if (failing.error) throw failing.error
    const rows = orders.data
    return {
      orders: rows.length,
      revenue: rows.reduce((sum, o) => sum + o.amount_cents, 0),
      inFlight: rows.filter(o => !['delivered', 'cancelled'].includes(o.status)).length,
      needsAttention: (failing.count ?? 0) + rows.filter(o => ['exception', 'stuck'].includes(o.status)).length,
    }
  },
  { watch: [orgId] },
)

// Coalesce bursts (one order = several events) into a single refetch.
let pending: ReturnType<typeof setTimeout> | undefined
function refreshSoon() {
  clearTimeout(pending)
  pending = setTimeout(() => {
    refreshFeed()
    refreshStats()
  }, 300)
}
const { connected } = useRealtime('events', orgId, refreshSoon)
useRealtime('orders', orgId, refreshSoon)

const tiles = computed(() => [
  { label: 'Orders (30 days)', value: stats.value?.orders ?? '—', icon: 'i-lucide-package' },
  { label: 'Revenue (30 days)', value: stats.value ? formatMoney(stats.value.revenue) : '—', icon: 'i-lucide-banknote' },
  { label: 'In flight', value: stats.value?.inFlight ?? '—', icon: 'i-lucide-truck' },
  { label: 'Needs attention', value: stats.value?.needsAttention ?? '—', icon: 'i-lucide-triangle-alert', to: '/events?status=failed' },
])

const { data: health } = useFetch('/api/health', { server: false, lazy: true })
</script>

<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar :title="current?.org.name ?? 'Dashboard'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge
            :label="connected ? 'Live' : 'Connecting…'"
            :color="connected ? 'success' : 'neutral'"
            variant="subtle"
            :icon="connected ? 'i-lucide-radio' : 'i-lucide-loader-circle'"
          />
          <OrdersSimulateButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <UPageCard
          v-for="tile in tiles"
          :key="tile.label"
          :icon="tile.icon"
          :title="String(tile.value)"
          :description="tile.label"
          :to="tile.to"
          variant="subtle"
          :ui="{ title: 'text-2xl font-semibold' }"
        />
      </div>

      <UPageCard
        title="Live event feed"
        description="Every webhook received and every API call made, as it happens."
        variant="subtle"
        class="mt-4"
      >
        <EventsEventFeed :events="feed" />
        <template #footer>
          <ULink
            to="/events"
            class="text-sm text-primary"
          >All events →</ULink>
        </template>
      </UPageCard>

      <p class="mt-6 text-xs text-dimmed">
        <template v-if="health?.heartbeats?.length">
          DB heartbeat:
          <span
            v-for="(beat, i) in health.heartbeats"
            :key="beat.source"
          >{{ i ? ' · ' : '' }}{{ beat.source }} {{ formatRelative(beat.lastSeen) }}</span>
        </template>
        <template v-else>
          DB heartbeat: no keep-alive pings recorded yet in this environment.
        </template>
      </p>
    </template>
  </UDashboardPanel>
</template>
