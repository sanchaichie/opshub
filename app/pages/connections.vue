<script setup lang="ts">
import type { Database } from '~~/shared/types/database.types'

useSeoMeta({ title: 'Connections · OpsHub' })

const supabase = useSupabaseClient<Database>()
const { orgId, current, isDemo, ready } = useOrg()
// Load the org before querying by it (see useOrg).
await ready

const route = useRoute()
const router = useRouter()
const toast = useToast()

const { data: available } = useFetch('/api/integrations', { default: () => [] })

// RLS: members read their org's connections. No secrets live in this table.
const { data: connections, refresh } = useAsyncData(
  'connections',
  async () => {
    if (!orgId.value) return []
    const { data, error } = await supabase
      .from('connections')
      .select('provider, status, account_label, metadata, created_at')
      .eq('org_id', orgId.value)
    if (error) throw error
    return data
  },
  { watch: [orgId], default: () => [] },
)

const canManage = computed(() => !isDemo.value && (current.value?.role === 'owner' || current.value?.role === 'admin'))
const manageNote = computed(() => isDemo.value
  ? 'The shared demo is pre-connected to the owner\'s sandbox accounts and can\'t be changed.'
  : canManage.value ? null : 'Only owners and admins can change connections.')

const cards = computed(() => Object.entries(providers)
  .filter(([id]) => id !== 'opshub')
  .map(([id, info]) => ({
    id,
    info,
    integration: available.value.find(i => i.id === id) ?? null,
    connection: connections.value.find(c => c.provider === id) ?? null,
  })))

// Results of an OAuth round-trip come back as fixed codes in the URL.
const ERRORS: Record<string, string> = {
  state_mismatch: 'The sign-in link was not started from this browser. Please try again.',
  expired: 'That connection attempt expired or was already used. Please try again.',
  declined: 'Connection was cancelled.',
  exchange_failed: 'The provider rejected the connection. Please try again.',
}
onMounted(() => {
  const { connected, error, provider } = route.query
  // Only known providers and error codes: a crafted link can't make this
  // page show arbitrary "… connected" text.
  const known = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(providers, id)
  if (known(connected)) toast.add({ title: `${providers[connected]!.label} connected`, color: 'success', icon: 'i-lucide-plug' })
  if (typeof error === 'string' && Object.hasOwn(ERRORS, error) && known(provider)) {
    toast.add({ title: `Couldn't connect ${providers[provider]!.label}`, description: ERRORS[error], color: 'error' })
  }
  if (connected || error) router.replace({ query: {} })
})

function connect(provider: string) {
  if (!orgId.value) return
  // A full navigation: the server redirects on to the provider.
  window.location.href = `/api/oauth/${provider}/start?orgId=${orgId.value}`
}

const confirming = ref<string | null>(null)
const disconnecting = ref(false)
async function disconnect(provider: string) {
  if (confirming.value !== provider) {
    confirming.value = provider
    return
  }
  disconnecting.value = true
  try {
    await $fetch(`/api/connections/${provider}`, { method: 'DELETE', query: { orgId: orgId.value } })
    toast.add({ title: `${providerInfo(provider).label} disconnected`, description: 'Its credentials were deleted.' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Could not disconnect', description: (error as { statusMessage?: string }).statusMessage, color: 'error' })
  }
  finally {
    confirming.value = null
    disconnecting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="connections">
    <template #header>
      <UDashboardNavbar title="Connections">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-sm text-muted max-w-2xl mb-2">
        <strong>Platform</strong> integrations use OpsHub's own API keys.
        <strong>Connected</strong> integrations use your organization's account, linked with OAuth;
        their credentials are encrypted in Supabase Vault and never sent to the browser.
      </p>
      <p
        v-if="manageNote"
        class="text-sm text-muted max-w-2xl mb-4"
      >
        <UIcon
          name="i-lucide-lock"
          class="align-middle"
        /> {{ manageNote }}
      </p>

      <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
        <UPageCard
          v-for="{ id, info, integration, connection } in cards"
          :key="id"
          :icon="info.icon"
          :title="info.label"
          :description="info.description"
          variant="subtle"
          :class="{ 'opacity-60': !integration }"
        >
          <template #footer>
            <div class="flex flex-wrap items-center gap-2 text-xs w-full">
              <template v-if="!integration">
                <UBadge
                  :label="`Coming in phase ${info.phase}`"
                  color="neutral"
                  variant="subtle"
                />
              </template>

              <!-- Platform: our keys -->
              <template v-else-if="!integration.connectable">
                <UBadge
                  label="Platform"
                  color="neutral"
                  variant="outline"
                />
                <UBadge
                  :label="integration.configured ? 'Configured' : 'Keys missing'"
                  :color="integration.configured ? 'success' : 'warning'"
                  variant="subtle"
                />
                <code
                  v-if="integration.webhookUrl"
                  class="basis-full text-muted break-all"
                >{{ integration.webhookUrl }}</code>
              </template>

              <!-- Connected: the org's own account -->
              <template v-else-if="connection">
                <UBadge
                  :label="connection.status === 'connected' ? 'Connected' : 'Needs reconnecting'"
                  :color="connection.status === 'connected' ? 'success' : 'error'"
                  variant="subtle"
                />
                <span class="text-muted">{{ connection.account_label }}</span>
                <p
                  v-if="connection.status === 'error' && (connection.metadata as Record<string, string>)?.last_error"
                  class="basis-full text-error"
                >
                  {{ (connection.metadata as Record<string, string>).last_error }}
                </p>
                <div
                  v-if="canManage"
                  class="basis-full flex gap-2 mt-1"
                >
                  <UButton
                    v-if="connection.status !== 'connected'"
                    label="Reconnect"
                    size="xs"
                    @click="connect(id)"
                  />
                  <UButton
                    :label="confirming === id ? 'Click again to disconnect' : 'Disconnect'"
                    size="xs"
                    color="error"
                    variant="soft"
                    :loading="disconnecting && confirming === id"
                    @click="disconnect(id)"
                  />
                </div>
              </template>

              <template v-else>
                <UBadge
                  label="Not connected"
                  color="neutral"
                  variant="subtle"
                />
                <UButton
                  v-if="canManage && integration.configured"
                  :label="`Connect ${info.label}`"
                  size="xs"
                  icon="i-lucide-plug"
                  @click="connect(id)"
                />
                <span
                  v-else-if="!integration.configured"
                  class="text-muted"
                >Not configured on this server yet</span>
              </template>
            </div>
          </template>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
