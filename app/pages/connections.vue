<script setup lang="ts">
useSeoMeta({ title: 'Connections · OpsHub' })

const { data: live } = useFetch('/api/integrations', { default: () => [] })

// OpsHub's own internal events aren't a connection.
const cards = computed(() => Object.entries(providers).filter(([id]) => id !== 'opshub').map(([id, info]) => {
  const integration = live.value.find(i => i.id === id)
  return { id, info, integration }
}))
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
      <p class="text-sm text-muted max-w-2xl mb-4">
        <strong>Platform</strong> integrations use OpsHub's own API keys.
        <strong>Connected</strong> integrations use your organization's account, linked with OAuth;
        their tokens are encrypted in Supabase Vault and never sent to the browser.
      </p>

      <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <UPageCard
          v-for="{ id, info, integration } in cards"
          :key="id"
          :icon="info.icon"
          :title="info.label"
          :description="info.description"
          variant="subtle"
          :class="{ 'opacity-60': !integration }"
        >
          <template #footer>
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <template v-if="integration">
                <UBadge
                  :label="integration.kind"
                  color="neutral"
                  variant="outline"
                  class="capitalize"
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
              <UBadge
                v-else
                :label="`Coming in phase ${info.phase}`"
                color="neutral"
                variant="subtle"
              />
            </div>
          </template>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
