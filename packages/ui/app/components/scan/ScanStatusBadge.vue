<script setup lang="ts">
const props = defineProps<{
  status: string
}>()

const color = computed(() => {
  switch (props.status) {
    case 'complete': return 'primary' as const
    case 'error': return 'error' as const
    default: return 'neutral' as const
  }
})

const variant = computed(() => {
  switch (props.status) {
    case 'complete': return 'solid' as const
    case 'cancelled':
    case 'paused': return 'outline' as const
    default: return 'soft' as const
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
  <UBadge :color="color" :variant="variant" class="text-xs">
    {{ label }}
  </UBadge>
</template>
