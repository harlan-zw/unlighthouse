<script lang="ts" setup>
import type { UnlighthouseTaskStatus } from 'unlighthouse'

const props = defineProps<{
  status: UnlighthouseTaskStatus
}>()

const color = computed(() => {
  if (isOffline.value && props.status !== 'completed' && props.status !== 'failed')
    return 'bg-elevated'

  switch (props.status) {
    case 'completed':
      return 'bg-success'
    case 'in-progress':
      return 'bg-warning'
    case 'waiting':
      return 'bg-muted'
    case 'failed':
      return 'bg-error'
  }
  return ''
})

const label = computed(() => {
  if (isOffline.value && props.status !== 'completed' && props.status !== 'failed')
    return 'Offline'

  switch (props.status) {
    case 'completed':
      return 'Completed'
    case 'in-progress':
      return 'In progress'
    case 'waiting':
      return 'Waiting'
    case 'failed':
      return 'Failed'
  }
  return ''
})
</script>

<template>
  <div class="inline-flex items-center">
    <div :class="[color]" class="rounded-full h-3 w-3 inline-block mr-1" />
    {{ label }}
  </div>
</template>
