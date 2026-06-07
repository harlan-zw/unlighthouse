<script setup lang="ts">
import { computed } from 'vue'

const {
  align = 'left',
  sortable = false,
  noPadding = false,
} = defineProps<{
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  noPadding?: boolean
}>()

const justify = computed(() => align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start')
const padClass = computed(() => noPadding ? '' : sortable ? 'px-2' : 'px-3')
</script>

<template>
  <th
    scope="col"
    class="text-label text-dimmed text-left whitespace-nowrap border-b border-default bg-default"
    :class="padClass"
  >
    <div class="flex items-center gap-1" :class="justify">
      <slot />
    </div>
  </th>
</template>
