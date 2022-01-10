<script lang="ts" setup>
import type { UnlighthouseTaskStatus } from '@unlighthouse/core'

const props = defineProps<{
  status: UnlighthouseTaskStatus
}>()

const color = computed(() => {
  switch (props.status) {
    case 'completed':
      return 'bg-green-500'
    case 'in-progress':
      return 'bg-yellow-500'
    case 'waiting':
      return 'bg-gray-500'
  }
})

const label = computed(() => {
  switch (props.status) {
    case 'completed':
      return 'Completed'
    case 'in-progress':
      return 'In progress'
    case 'waiting':
      return 'Waiting'
  }
})
</script>
<template>
  <div class="inline-flex items-center">
    <div :class="[color]" class="rounded-full h-3 w-3 inline-block mr-1" />
    {{ label }}
  </div>
</template>
