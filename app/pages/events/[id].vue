<script setup lang="ts">
import type { Database } from '~~/shared/types/database.types'

const supabase = useSupabaseClient<Database>()
const route = useRoute()
const toast = useToast()
const id = computed(() => String(route.params.id))

const { data, refresh } = useAsyncData(
  () => `event-${id.value}`,
  async () => {
    const [event, attempts] = await Promise.all([
      supabase.from('events').select('*').eq('id', id.value).maybeSingle(),
      supabase.from('event_attempts').select('*').eq('event_id', id.value).order('attempt_no', { ascending: false }),
    ])
    if (event.error) throw event.error
    if (attempts.error) throw attempts.error
    return { event: event.data, attempts: attempts.data }
  },
)

const event = computed(() => data.value?.event ?? null)
useSeoMeta({ title: () => event.value ? `${event.value.provider} · ${event.value.type} · OpsHub` : 'Event · OpsHub' })

const orgId = computed(() => event.value?.org_id ?? null)
useRealtime('events', orgId, () => refresh())

const canRetry = computed(() => event.value?.status === 'failed' || event.value?.status === 'dead')
const retrying = ref(false)
async function retry() {
  retrying.value = true
  try {
    await $fetch(`/api/events/${id.value}/retry`, { method: 'POST' })
    toast.add({ title: 'Retry queued', description: 'The result will appear here in a moment.', icon: 'i-lucide-rotate-cw' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Retry failed', description: (error as { statusMessage?: string }).statusMessage, color: 'error' })
  }
  finally {
    retrying.value = false
  }
}

const meta = computed(() => {
  const e = event.value
  if (!e) return []
  return [
    ['Provider', providerInfo(e.provider).label],
    ['Type', e.type],
    ['Direction', e.direction],
    ['Attempts', `${e.attempts} of ${e.max_attempts}`],
    ['HTTP status', e.http_status ?? '—'],
    [e.direction === 'inbound' ? 'Provider event id' : 'Idempotency key', e.external_id ?? e.idempotency_key ?? '—'],
    ['Received', formatDateTime(e.created_at)],
    ['Processed', formatDateTime(e.processed_at)],
    ...(e.status === 'failed' ? [['Next attempt', `${formatRelative(e.next_attempt_at)} (${formatDateTime(e.next_attempt_at)})`]] : []),
  ] as [string, string | number][]
})
</script>

<template>
  <UDashboardPanel :id="`event-${id}`">
    <template #header>
      <UDashboardNavbar :title="event ? `${providerInfo(event.provider).label} · ${event.type}` : 'Event'">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/events"
            aria-label="Back to events"
          />
        </template>
        <template
          v-if="event"
          #right
        >
          <StatusBadge
            :status="event.status"
            kind="event"
          />
          <UButton
            v-if="canRetry"
            label="Retry"
            icon="i-lucide-rotate-cw"
            :loading="retrying"
            @click="retry"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="data && !event"
        icon="i-lucide-search-x"
        title="Event not found"
        description="It doesn't exist, or it belongs to an organization you're not in."
      />

      <div
        v-else-if="event"
        class="space-y-4"
      >
        <UAlert
          v-if="event.error"
          :title="event.status === 'dead' ? 'Gave up on this event' : 'Last attempt failed'"
          :description="event.error"
          :color="event.status === 'dead' ? 'error' : 'warning'"
          variant="subtle"
          icon="i-lucide-triangle-alert"
        />

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <UPageCard
            title="Details"
            variant="subtle"
          >
            <dl class="grid grid-cols-[8.5rem_1fr] gap-y-2 text-sm">
              <template
                v-for="[label, value] in meta"
                :key="label"
              >
                <dt class="text-muted">
                  {{ label }}
                </dt>
                <dd class="break-all">
                  {{ value }}
                </dd>
              </template>
              <template v-if="event.order_id">
                <dt class="text-muted">
                  Order
                </dt>
                <dd>
                  <ULink
                    :to="`/orders/${event.order_id}`"
                    class="text-primary"
                  >View order →</ULink>
                </dd>
              </template>
            </dl>
          </UPageCard>

          <div class="lg:col-span-2 space-y-4 min-w-0">
            <JsonView
              :value="event.request"
              :label="event.direction === 'inbound' ? 'Webhook received (redacted)' : 'Request (redacted)'"
            />
            <JsonView
              :value="event.response"
              label="Result"
            />
          </div>
        </div>

        <UPageCard
          title="Attempts"
          :description="`${data?.attempts.length ?? 0} recorded`"
          variant="subtle"
        >
          <ul class="divide-y divide-default text-sm">
            <li
              v-for="a in data?.attempts"
              :key="a.id"
              class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
            >
              <span class="font-medium w-20">#{{ a.attempt_no }}</span>
              <span class="text-muted w-44">{{ formatDateTime(a.started_at) }}</span>
              <span class="text-muted w-16">{{ a.duration_ms ?? '—' }} ms</span>
              <UBadge
                :label="a.error ? (a.http_status ? `HTTP ${a.http_status}` : 'error') : (a.http_status ? `HTTP ${a.http_status}` : 'ok')"
                :color="a.error ? 'error' : 'success'"
                variant="subtle"
              />
              <span
                v-if="a.error"
                class="text-error text-xs basis-full sm:basis-auto"
              >{{ a.error }}</span>
            </li>
          </ul>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
