<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  status: string
}>()

const variant = computed(() => {
  switch (props.status) {
    case 'complete': return 'default' as const
    case 'scanning':
    case 'discovering':
    case 'starting': return 'secondary' as const
    case 'error': return 'destructive' as const
    case 'cancelled':
    case 'paused': return 'outline' as const
    default: return 'outline' as const
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
  <Badge :variant="variant" class="text-xs">
    {{ label }}
  </Badge>
</template>
