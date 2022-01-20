<script lang="ts" setup>
import type { UnlighthouseTaskStatus } from '@unlighthouse/core'
import { isOffline } from '../../logic'

const props = defineProps<{
  status: UnlighthouseTaskStatus
}>()

const color = computed(() => {
  if (isOffline.value && props.status !== 'completed' && props.status !== 'failed')
    return 'bg-gray-700'

  switch (props.status) {
    case 'completed':
      return 'bg-green-500'
    case 'in-progress':
      return 'bg-yellow-500'
    case 'waiting':
      return 'bg-gray-500'
    case 'failed':
      return 'bg-red-500'
  }
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
})
</script>
<template>
  <div class="inline-flex items-center">
    <div :class="[color]" class="rounded-full h-3 w-3 inline-block mr-1" />
    {{ label }}
  </div>
</template>
