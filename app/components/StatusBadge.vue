<script setup lang="ts">
const props = defineProps<{ status: string, kind: 'order' | 'event' }>()

const color = computed(() => props.kind === 'order'
  ? orderStatusColor[props.status as OrderStatus] ?? 'neutral'
  : eventStatusColor[props.status as EventStatus] ?? 'neutral')
</script>

<template>
  <UBadge
    :label="humanize(status)"
    :color="color"
    variant="subtle"
    class="capitalize"
  />
</template>
