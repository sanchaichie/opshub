<script setup lang="ts">
import type { Tables } from '~~/shared/types/database.types'

type FeedEvent = Pick<Tables<'events'>, 'id' | 'provider' | 'type' | 'direction' | 'status' | 'attempts' | 'error' | 'created_at' | 'updated_at'>

defineProps<{ events: FeedEvent[] }>()

const directionIcon = {
  inbound: 'i-lucide-arrow-down-left',
  outbound: 'i-lucide-arrow-up-right',
  internal: 'i-lucide-repeat',
} as const
</script>

<template>
  <ul
    v-if="events.length"
    class="divide-y divide-default"
  >
    <li
      v-for="event in events"
      :key="event.id"
    >
      <NuxtLink
        :to="`/events/${event.id}`"
        class="flex items-center gap-3 py-2.5 px-1 hover:bg-elevated/50 rounded-md transition-colors"
      >
        <UIcon
          :name="providerInfo(event.provider).icon"
          class="size-5 shrink-0 text-muted"
        />
        <UIcon
          :name="directionIcon[event.direction]"
          class="size-4 shrink-0 text-dimmed"
          :aria-label="event.direction"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium truncate">
            {{ providerInfo(event.provider).label }} · <span class="font-mono text-xs">{{ event.type }}</span>
          </p>
          <p
            v-if="event.error"
            class="text-xs text-error truncate"
          >
            {{ event.error }}
          </p>
        </div>
        <span
          v-if="event.attempts > 1"
          class="text-xs text-muted shrink-0"
        >×{{ event.attempts }}</span>
        <StatusBadge
          :status="event.status"
          kind="event"
        />
        <time
          :datetime="event.updated_at"
          class="text-xs text-muted w-24 text-right shrink-0 hidden sm:block"
        >{{ formatRelative(event.updated_at) }}</time>
      </NuxtLink>
    </li>
  </ul>
  <UEmpty
    v-else
    icon="i-lucide-activity"
    title="No events yet"
    description="Simulate an order to watch it flow through the system."
  />
</template>
