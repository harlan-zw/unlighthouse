<script lang="ts" setup>
import type { UnlighthouseColumn } from '@unlighthouse/contracts'
import type { Sorting } from '~/composables/search'

defineProps<{
  sorting: Sorting
  column: UnlighthouseColumn
}>()

defineEmits<{
  (e: 'sort', key: string): void
}>()

function htmlTooltip(s: string) {
  return s
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a class="underline" target="_blank" href="$2">$1</a>')
    .replace(/\n/g, '<br>')
}
</script>

<template>
  <div
    :class="[`col-span-${column.cols || '2'}`, ...(column.classes ? column.classes : [])]"
    class="flex flex-col"
  >
    <div class="flex items-center ">
      <Tooltip v-if="column.tooltip">
        <span class="whitespace-nowrap flex items-center">{{ column.label }}
          <UIcon v-if="column?.warning" name="i-carbon-warning-alt" class="text-warning ml-1 text-xs opacity-75" />
          <UIcon v-else name="i-carbon-information" class="ml-1 text-xs opacity-75" />
        </span>
        <template #tooltip>
          <div v-html="htmlTooltip(column.tooltip)" />
        </template>
      </Tooltip>
      <div v-else>
        <span class="whitespace-nowrap">{{ column.label }}</span>
      </div>
      <button
        v-if="(column.sortable || !!column.sortKey) && column.key"
        class="ml-2 p-0.3 bg-primary/10 border border-primary/20 hover:border-primary/40 rounded-lg transition-colors"
        :class="sorting.key === column.key && sorting.dir ? ['bg-primary/25', 'text-primary', 'border-primary/40'] : []"
        @click="$emit('sort', column.key)"
      >
        <UIcon v-if="sorting.key !== column.key || !sorting.dir" name="i-carbon-chevron-sort" />
        <UIcon v-else-if="sorting.key === column.key && sorting.dir === 'desc'" name="i-carbon-chevron-sort-down" />
        <UIcon v-else-if="sorting.key === column.key && sorting.dir === 'asc'" name="i-carbon-chevron-sort-up" />
      </button>
    </div>
    <slot :name="(column as any).slot || column.label" />
  </div>
</template>
