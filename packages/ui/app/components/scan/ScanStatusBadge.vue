<script setup lang="ts">
const props = defineProps<{
  status: string
}>()

const badge = computed(() => {
  switch (props.status) {
    case 'complete': return { color: 'primary', variant: 'solid' } as const
    case 'scanning':
    case 'discovering':
    case 'starting': return { color: 'neutral', variant: 'subtle' } as const
    case 'error': return { color: 'error', variant: 'solid' } as const
    case 'cancelled':
    case 'paused': return { color: 'neutral', variant: 'outline' } as const
    default: return { color: 'neutral', variant: 'outline' } as const
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
  <UBadge :color="badge.color" :variant="badge.variant" class="text-xs">
    {{ label }}
  </UBadge>
</template>
