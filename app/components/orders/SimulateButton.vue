<script setup lang="ts">
const { orgId } = useOrg()
const toast = useToast()
const loading = ref(false)

async function simulate() {
  if (!orgId.value) return
  loading.value = true
  try {
    const result = await $fetch('/api/orders/simulate', { method: 'POST', body: { orgId: orgId.value } })
    toast.add({
      title: 'Order simulated',
      description: `${result.customer} is paying via Stripe test mode. Watch the live feed.`,
      icon: 'i-lucide-zap',
      color: 'success',
    })
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    toast.add({
      title: status === 429 ? 'Simulation limit reached' : 'Could not simulate an order',
      description: (error as { statusMessage?: string }).statusMessage ?? 'Please try again.',
      color: status === 429 ? 'warning' : 'error',
    })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UButton
    label="Simulate order"
    icon="i-lucide-zap"
    :loading="loading"
    :disabled="!orgId"
    @click="simulate"
  />
</template>
