<script setup lang="ts">
const props = defineProps<{ value: unknown, label?: string }>()
const text = computed(() => props.value === null || props.value === undefined
  ? 'null'
  : JSON.stringify(props.value, null, 2))
const copied = ref(false)

async function copy(value: string) {
  await navigator.clipboard.writeText(value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="rounded-md border border-default bg-elevated/50">
    <div class="flex items-center justify-between px-3 py-1.5 border-b border-default text-xs text-muted">
      <span>{{ label ?? 'JSON' }}</span>
      <UButton
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="`Copy ${label ?? 'JSON'}`"
        @click="copy(text)"
      />
    </div>
    <pre class="p-3 text-xs overflow-auto max-h-96 font-mono whitespace-pre"><code>{{ text }}</code></pre>
  </div>
</template>
