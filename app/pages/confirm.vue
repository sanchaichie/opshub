<script setup lang="ts">
// OAuth and email-confirmation links land here. The Supabase module exchanges
// the code for a session; once the user appears, continue to the app.
definePageMeta({ layout: false })

const user = useSupabaseUser()

watch(user, (value) => {
  if (value) navigateTo('/dashboard', { replace: true })
}, { immediate: true })
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center gap-2 text-muted">
    <UIcon
      name="i-lucide-loader-circle"
      class="animate-spin size-5"
    />
    Signing you in…
  </div>
</template>
