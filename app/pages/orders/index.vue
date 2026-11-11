<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Database } from '~~/shared/types/database.types'

useSeoMeta({ title: 'Orders · OpsHub' })

const supabase = useSupabaseClient<Database>()
const { orgId, ready } = useOrg()
// Load the org before querying by it (see useOrg).
await ready
const route = useRoute()
const toast = useToast()

const { data: orders, refresh, status } = useAsyncData(
  'orders',
  async () => {
    if (!orgId.value) return []
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, source, amount_cents, currency, line_items, created_at, customers(name, email)')
      .eq('org_id', orgId.value)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return data
  },
  { watch: [orgId], default: () => [] },
)
useRealtime('orders', orgId, () => refresh())

type Row = (typeof orders.value)[number]

// Most useful first, so on a phone the essentials fit before the table scrolls.
const columns: TableColumn<Row>[] = [
  { id: 'customer', header: 'Customer' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'amount_cents', header: 'Total' },
  { accessorKey: 'created_at', header: 'Placed' },
  { id: 'items', header: 'Items' },
  { accessorKey: 'source', header: 'Source' },
]

const itemCount = (row: Row) =>
  (row.line_items as { quantity: number }[]).reduce((n, i) => n + i.quantity, 0)

// Back from Stripe Checkout.
onMounted(() => {
  if (route.query.checkout === 'success') {
    toast.add({ title: 'Payment received', description: 'The order appears here as soon as Stripe\'s webhook arrives.', color: 'success' })
  }
})

// Real Stripe Checkout (test mode): pay with 4242 4242 4242 4242.
const checkoutLoading = ref(false)
async function checkout() {
  if (!orgId.value) return
  checkoutLoading.value = true
  try {
    const { url } = await $fetch('/api/checkout', { method: 'POST', body: { orgId: orgId.value, sku: 'mug' } })
    await navigateTo(url, { external: true })
  }
  catch (error) {
    toast.add({ title: 'Could not start Checkout', description: (error as { statusMessage?: string }).statusMessage, color: 'error' })
  }
  finally {
    checkoutLoading.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="orders">
    <template #header>
      <UDashboardNavbar title="Orders">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-simple-icons-stripe"
            color="neutral"
            variant="subtle"
            aria-label="Test Checkout"
            :loading="checkoutLoading"
            @click="checkout"
          >
            <!-- Icon-only on phones, so the page title keeps its space. -->
            <span class="hidden sm:inline">Test Checkout</span>
          </UButton>
          <OrdersSimulateButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable
        :data="orders"
        :columns="columns"
        :loading="status === 'pending'"
        class="flex-1"
        :ui="{ tr: 'cursor-pointer' }"
        @select="(_e: Event, row: { original: Row }) => navigateTo(`/orders/${row.original.id}`)"
      >
        <template #created_at-cell="{ row }">
          <span :title="formatDateTime(row.original.created_at)">{{ formatRelative(row.original.created_at) }}</span>
        </template>
        <template #customer-cell="{ row }">
          <div class="min-w-0">
            <p class="font-medium truncate">
              {{ row.original.customers?.name ?? '—' }}
            </p>
            <p class="text-xs text-muted truncate">
              {{ row.original.customers?.email }}
            </p>
          </div>
        </template>
        <template #items-cell="{ row }">
          {{ itemCount(row.original) }}
        </template>
        <template #amount_cents-cell="{ row }">
          {{ formatMoney(row.original.amount_cents, row.original.currency) }}
        </template>
        <template #source-cell="{ row }">
          <span class="capitalize text-muted">{{ row.original.source }}</span>
        </template>
        <template #status-cell="{ row }">
          <StatusBadge
            :status="row.original.status"
            kind="order"
          />
        </template>
        <template #empty>
          <UEmpty
            icon="i-lucide-package"
            title="No orders yet"
            description="Simulate an order, or run a test Checkout with card 4242 4242 4242 4242."
          />
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
