<script setup lang="ts">
const toast = useToast()
const loading = ref(false)
const { select } = useOrg()

async function tryDemo() {
  loading.value = true
  try {
    // The server creates this visitor's own demo account and sets the
    // session cookie; no credentials ever reach the browser.
    const { orgId } = await $fetch('/api/demo/login', { method: 'POST' })
    select(orgId)
    // Full navigation so the new session cookie is picked up everywhere.
    await navigateTo('/dashboard', { external: true })
  }
  catch (error) {
    toast.add({ title: 'The demo is unavailable', description: (error as { statusMessage?: string }).statusMessage, color: 'error' })
    loading.value = false
  }
}
</script>

<template>
  <UButton
    label="Try the demo"
    icon="i-lucide-play"
    size="xl"
    :loading="loading"
    @click="tryDemo"
  />
</template>
