<script setup lang="ts">
const props = defineProps<{
  status: string
}>()

const semanticStatus = computed(() => {
  switch (props.status) {
    case 'complete':
      return 'success'
    case 'error':
      return 'error'
    case 'starting':
    case 'discovering':
    case 'scanning':
      return 'info'
    case 'paused':
      return 'warning'
    case 'cancelled':
    case 'idle':
    default:
      return 'neutral'
  }
})

const label = computed(() => {
  const map: Record<string, string> = {
    idle: 'Idle',
    starting: 'Starting',
    discovering: 'Discovering',
    scanning: 'Scanning',
    paused: 'Paused',
    complete: 'Complete',
    cancelled: 'Cancelled',
    error: 'Error',
  }
  return map[props.status] || props.status
})
</script>

<template>
  <UiStatusBadge :status="semanticStatus" :label="label" />
</template>
