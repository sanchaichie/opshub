<script setup lang="ts">
import type { TimelineItem } from '@nuxt/ui'
import type { Database } from '~~/shared/types/database.types'

const supabase = useSupabaseClient<Database>()
const route = useRoute()
const id = computed(() => String(route.params.id))

const { data, refresh } = useAsyncData(
  () => `order-${id.value}`,
  async () => {
    // RLS: returns nothing for orders outside the viewer's orgs.
    const [order, history, events] = await Promise.all([
      supabase.from('orders').select('*, customers(name, email)').eq('id', id.value).maybeSingle(),
      supabase.from('order_status_history').select('id, from_status, to_status, event_id, created_at').eq('order_id', id.value).order('created_at'),
      supabase.from('events').select('id, provider, type, direction, status, attempts, error, response, created_at, updated_at').eq('order_id', id.value).order('created_at', { ascending: false }),
    ])
    for (const r of [order, history, events]) if (r.error) throw r.error

    // For the "View deal in HubSpot" link: the org's portal id (RLS: members read connections).
    let hubspotPortal: unknown = null
    if (order.data?.hubspot_deal_id) {
      const { data: connection } = await supabase.from('connections').select('metadata').eq('org_id', order.data.org_id).eq('provider', 'hubspot').maybeSingle()
      hubspotPortal = (connection?.metadata as { portal_id?: unknown } | null)?.portal_id ?? null
    }

    // Whether "Book a call" is available (RLS: members read connections).
    let googleConnected = false
    if (order.data) {
      const { data: g } = await supabase.from('connections').select('status').eq('org_id', order.data.org_id).eq('provider', 'google').maybeSingle()
      googleConnected = g?.status === 'connected'
    }

    // AI assist results for this order (RLS: members read their org's outputs).
    const { data: aiOutputs } = await supabase
      .from('ai_outputs')
      .select('id, kind, model, content, input_tokens, output_tokens, created_at')
      .eq('order_id', id.value)
      .order('created_at', { ascending: false })
      .limit(6)

    return { order: order.data, history: history.data ?? [], events: events.data ?? [], hubspotPortal, googleConnected, aiOutputs: aiOutputs ?? [] }
  },
)

const order = computed(() => data.value?.order ?? null)
useSeoMeta({ title: () => `Order ${id.value.slice(0, 8)} · OpsHub` })

const orgId = computed(() => order.value?.org_id ?? null)
useRealtime('events', orgId, () => refresh())

interface Address {
  name: string
  street1: string
  street2?: string
  city: string
  state?: string
  zip?: string
  country: string
}
const address = computed(() => (order.value?.shipping_address ?? null) as Address | null)
// Provider-supplied URL: only ever render it as a link if it's plain https.
const labelUrl = computed(() => {
  const url = order.value?.label_url
  return url && /^https:\/\//i.test(url) ? url : null
})
const lineItems = computed(() => (order.value?.line_items ?? []) as { name: string, quantity: number, unit_amount: number }[])

// ── Customer follow-up (Google) ──
const googleEvents = computed(() => (data.value?.events ?? []).filter(e => e.provider === 'google'))
const followUp = computed(() => googleEvents.value.find(e => e.type === 'send_follow_up') ?? null)
const calls = computed(() => googleEvents.value
  .filter(e => e.type === 'book_call')
  .map((e) => {
    const r = (e.response ?? {}) as { starts_at?: string, meet_link?: unknown }
    // Only real Meet links become links.
    const meet = typeof r.meet_link === 'string' && /^https:\/\/meet\.google\.com\/[a-z-]+$/.test(r.meet_link) ? r.meet_link : null
    return { id: e.id, status: e.status, startsAt: r.starts_at ?? null, meet, error: e.error }
  }))

const toast = useToast()
const callAt = ref('')
const booking = ref(false)
async function bookCall() {
  if (!callAt.value) return
  booking.value = true
  try {
    await $fetch(`/api/orders/${id.value}/book-call`, { method: 'POST', body: { startsAt: new Date(callAt.value).toISOString() } })
    toast.add({ title: 'Booking the call', description: 'The Meet link appears here in a moment.', icon: 'i-lucide-calendar-plus' })
    callAt.value = ''
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Could not book the call', description: (error as { statusMessage?: string }).statusMessage, color: 'error' })
  }
  finally {
    booking.value = false
  }
}

// ── AI assist (Claude) ──
const { isDemo } = useOrg()
const latestSummary = computed(() => data.value?.aiOutputs.find(o => o.kind === 'summary') ?? null)
const drafts = computed(() => (data.value?.aiOutputs ?? []).filter(o => o.kind === 'reply_draft').slice(0, 3))
const customerMessage = ref('')
const aiBusy = ref<'summary' | 'reply_draft' | null>(null)

async function runAi(kind: 'summary' | 'reply_draft') {
  aiBusy.value = kind
  try {
    await $fetch(`/api/orders/${id.value}/ai`, {
      method: 'POST',
      body: kind === 'summary' ? { kind } : { kind, customerMessage: customerMessage.value },
    })
    if (kind === 'reply_draft') customerMessage.value = ''
    await refresh()
  }
  catch (error) {
    toast.add({ title: kind === 'summary' ? 'Could not summarize' : 'Could not draft a reply', description: (error as { statusMessage?: string }).statusMessage, color: 'error' })
  }
  finally {
    aiBusy.value = null
  }
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: 'Copied', icon: 'i-lucide-copy' })
}

// Built only from numeric ids, never from provider-supplied text.
const hubspotDealUrl = computed(() => {
  const portal = String(data.value?.hubspotPortal ?? '')
  const deal = order.value?.hubspot_deal_id ?? ''
  return /^\d+$/.test(portal) && /^\d+$/.test(deal)
    ? `https://app.hubspot.com/contacts/${portal}/record/0-3/${deal}`
    : null
})

const timeline = computed<TimelineItem[]>(() => (data.value?.history ?? []).map(h => ({
  date: formatDateTime(h.created_at),
  title: humanize(h.to_status),
  description: h.from_status ? `from ${humanize(h.from_status)}` : 'created',
  icon: 'i-lucide-circle-dot',
})))
</script>

<template>
  <UDashboardPanel :id="`order-${id}`">
    <template #header>
      <UDashboardNavbar :title="order ? `Order · ${order.customers?.name ?? 'Unknown customer'}` : 'Order'">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/orders"
            aria-label="Back to orders"
          />
        </template>
        <template
          v-if="order"
          #right
        >
          <StatusBadge
            :status="order.status"
            kind="order"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="data && !order"
        icon="i-lucide-search-x"
        title="Order not found"
        description="It doesn't exist, or it belongs to an organization you're not in."
      />

      <div
        v-else-if="order"
        class="grid lg:grid-cols-3 gap-4"
      >
        <div class="lg:col-span-2 space-y-4">
          <UPageCard
            title="Summary"
            variant="subtle"
          >
            <dl class="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <dt class="text-muted">
                Customer
              </dt>
              <dd>{{ order.customers?.name ?? '—' }} <span class="text-muted">· {{ order.customers?.email }}</span></dd>
              <dt class="text-muted">
                Total
              </dt>
              <dd class="font-medium">
                {{ formatMoney(order.amount_cents, order.currency) }}
              </dd>
              <dt class="text-muted">
                Source
              </dt>
              <dd class="capitalize">
                {{ order.source }}
              </dd>
              <dt class="text-muted">
                Placed
              </dt>
              <dd>{{ formatDateTime(order.created_at) }}</dd>
              <dt class="text-muted">
                Stripe payment
              </dt>
              <dd class="font-mono text-xs break-all">
                {{ order.stripe_payment_intent_id ?? '—' }}
              </dd>
              <template v-if="order.hubspot_deal_id">
                <dt class="text-muted">
                  HubSpot deal
                </dt>
                <dd>
                  <ULink
                    v-if="hubspotDealUrl"
                    :to="hubspotDealUrl"
                    target="_blank"
                    class="text-primary"
                  >View deal in HubSpot ↗</ULink>
                  <span
                    v-else
                    class="font-mono text-xs"
                  >{{ order.hubspot_deal_id }}</span>
                </dd>
              </template>
            </dl>
          </UPageCard>

          <UPageCard
            title="Shipping"
            variant="subtle"
          >
            <div
              v-if="address"
              class="grid sm:grid-cols-2 gap-4 text-sm"
            >
              <address class="not-italic leading-relaxed">
                <span class="font-medium">{{ address.name }}</span><br>
                {{ address.street1 }}<br>
                <template v-if="address.street2">
                  {{ address.street2 }}<br>
                </template>
                {{ address.city }}<template v-if="address.state">
                  , {{ address.state }}
                </template> {{ address.zip }}<br>
                {{ address.country }}
              </address>
              <dl class="grid grid-cols-[6rem_1fr] gap-y-2 content-start">
                <dt class="text-muted">
                  Carrier
                </dt>
                <dd>{{ order.carrier ?? 'Not shipped yet' }}</dd>
                <dt class="text-muted">
                  Tracking
                </dt>
                <dd class="font-mono text-xs break-all">
                  {{ order.tracking_code ?? '—' }}
                </dd>
                <dt class="text-muted">
                  Label
                </dt>
                <dd>
                  <ULink
                    v-if="labelUrl"
                    :to="labelUrl"
                    target="_blank"
                    class="text-primary"
                  >View label ↗</ULink>
                  <span v-else>—</span>
                </dd>
              </dl>
            </div>
            <p
              v-else
              class="text-sm text-muted"
            >
              No shipping address on this order, so nothing to ship.
            </p>
          </UPageCard>

          <UPageCard
            title="Items"
            variant="subtle"
          >
            <ul class="divide-y divide-default text-sm">
              <li
                v-for="item in lineItems"
                :key="item.name"
                class="flex justify-between py-2"
              >
                <span>{{ item.quantity }} × {{ item.name }}</span>
                <span>{{ formatMoney(item.unit_amount * item.quantity, order.currency) }}</span>
              </li>
            </ul>
          </UPageCard>

          <UPageCard
            title="AI assist"
            description="Claude summarizes the order and drafts replies for you to review. Nothing is sent automatically."
            variant="subtle"
          >
            <div class="space-y-5 text-sm">
              <div>
                <div class="flex items-center justify-between gap-2 mb-2">
                  <span class="font-medium">Summary</span>
                  <UButton
                    :label="latestSummary ? 'Refresh summary' : 'Summarize order'"
                    icon="i-lucide-sparkles"
                    size="xs"
                    variant="soft"
                    :loading="aiBusy === 'summary'"
                    @click="runAi('summary')"
                  />
                </div>
                <template v-if="latestSummary">
                  <p class="whitespace-pre-line">
                    {{ latestSummary.content }}
                  </p>
                  <p class="text-xs text-dimmed mt-1">
                    {{ latestSummary.model }} · {{ latestSummary.input_tokens + latestSummary.output_tokens }} tokens · {{ formatRelative(latestSummary.created_at) }}
                  </p>
                </template>
                <p
                  v-else
                  class="text-muted"
                >
                  No summary yet.
                </p>
              </div>

              <form
                class="space-y-2"
                @submit.prevent="runAi('reply_draft')"
              >
                <UFormField
                  label="Draft a reply to a customer message"
                  name="customerMessage"
                  :help="isDemo ? 'This demo is public: don\'t paste real personal information.' : 'The message is sent to Claude but not stored.'"
                >
                  <UTextarea
                    v-model="customerMessage"
                    :rows="3"
                    :maxlength="4000"
                    placeholder="Paste the customer's email…"
                    class="w-full"
                  />
                </UFormField>
                <UButton
                  type="submit"
                  label="Draft reply"
                  icon="i-lucide-pen-line"
                  size="xs"
                  :loading="aiBusy === 'reply_draft'"
                  :disabled="!customerMessage.trim()"
                />
              </form>

              <div
                v-for="draft in drafts"
                :key="draft.id"
                class="rounded-md border border-default p-3"
              >
                <p class="whitespace-pre-line">
                  {{ draft.content }}
                </p>
                <div class="flex items-center justify-between mt-2 text-xs text-dimmed">
                  <span>AI draft: check links and claims before sending · {{ draft.model }} · {{ draft.input_tokens + draft.output_tokens }} tokens · {{ formatRelative(draft.created_at) }}</span>
                  <UButton
                    label="Copy"
                    icon="i-lucide-copy"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="copyText(draft.content)"
                  />
                </div>
              </div>
            </div>
          </UPageCard>

          <UPageCard
            title="Customer follow-up"
            description="Email and calls through the organization's connected Google account."
            variant="subtle"
          >
            <div class="space-y-4 text-sm">
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-mail"
                  class="text-muted"
                />
                <span v-if="followUp">
                  Follow-up email: <StatusBadge
                    :status="followUp.status"
                    kind="event"
                  />
                </span>
                <span
                  v-else
                  class="text-muted"
                >Follow-up email is sent automatically when the order is delivered{{ data?.googleConnected ? '' : ' (connect Google first)' }}.</span>
              </div>

              <ul
                v-if="calls.length"
                class="divide-y divide-default"
              >
                <li
                  v-for="call in calls"
                  :key="call.id"
                  class="flex flex-wrap items-center gap-2 py-2"
                >
                  <UIcon
                    name="i-lucide-video"
                    class="text-muted"
                  />
                  <span>{{ call.startsAt ? formatDateTime(call.startsAt) : 'Booking…' }}</span>
                  <StatusBadge
                    :status="call.status"
                    kind="event"
                  />
                  <ULink
                    v-if="call.meet"
                    :to="call.meet"
                    target="_blank"
                    class="text-primary"
                  >Join Meet ↗</ULink>
                  <span
                    v-if="call.error"
                    class="text-error text-xs basis-full"
                  >{{ call.error }}</span>
                </li>
              </ul>

              <form
                v-if="data?.googleConnected"
                class="flex flex-wrap items-end gap-2"
                @submit.prevent="bookCall"
              >
                <UFormField
                  label="Book a 30-minute call"
                  name="callAt"
                >
                  <UInput
                    v-model="callAt"
                    type="datetime-local"
                    required
                  />
                </UFormField>
                <UButton
                  type="submit"
                  label="Book call"
                  icon="i-lucide-calendar-plus"
                  :loading="booking"
                  :disabled="!callAt"
                />
              </form>
            </div>
          </UPageCard>

          <UPageCard
            title="Integration events"
            description="Every webhook and API call for this order."
            variant="subtle"
          >
            <EventsEventFeed :events="data?.events ?? []" />
          </UPageCard>
        </div>

        <UPageCard
          title="Status history"
          variant="subtle"
        >
          <UTimeline
            :items="timeline"
            :default-value="timeline.length - 1"
            size="xs"
          />
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
