<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const { memberships, current, select, isDemo } = useOrg()
const user = useSupabaseUser()
const supabase = useSupabaseClient()

const links: NavigationMenuItem[] = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/dashboard' },
  { label: 'Orders', icon: 'i-lucide-package', to: '/orders' },
  { label: 'Events', icon: 'i-lucide-activity', to: '/events' },
  { label: 'Connections', icon: 'i-lucide-plug', to: '/connections' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
]

const orgItems = computed<DropdownMenuItem[][]>(() => [
  memberships.value.map(m => ({
    label: m.org.name,
    icon: m.org.isDemo ? 'i-lucide-flask-conical' : 'i-lucide-building-2',
    type: 'checkbox' as const,
    checked: m.org.id === current.value?.org.id,
    onSelect: () => select(m.org.id),
  })),
])

const userItems: DropdownMenuItem[][] = [[
  {
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    async onSelect() {
      // 'local' signs out this browser only. The default ('global') revokes
      // every session of the user, which is surprising for real users.
      await supabase.auth.signOut({ scope: 'local' })
      await navigateTo('/login')
    },
  },
]]
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      collapsible
      resizable
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <UDropdownMenu
          :items="orgItems"
          :content="{ align: 'start' }"
          class="w-full"
        >
          <UButton
            :label="collapsed ? undefined : (current?.org.name ?? 'OpsHub')"
            :icon="isDemo ? 'i-lucide-flask-conical' : 'i-lucide-building-2'"
            :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
            color="neutral"
            variant="ghost"
            block
            class="justify-start"
          />
        </UDropdownMenu>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu
          :items="userItems"
          :content="{ align: 'start' }"
          class="w-full"
        >
          <UButton
            :label="collapsed ? undefined : (user?.email ?? 'Account')"
            icon="i-lucide-circle-user"
            color="neutral"
            variant="ghost"
            block
            class="justify-start truncate"
          />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <div class="flex flex-col flex-1 min-w-0">
      <UBanner
        v-if="isDemo"
        icon="i-lucide-flask-conical"
        title="You're in the shared public demo: everything here is test data, visible to every visitor, and it resets nightly at 03:00 UTC."
        color="primary"
      />
      <slot />
    </div>
  </UDashboardGroup>
</template>
