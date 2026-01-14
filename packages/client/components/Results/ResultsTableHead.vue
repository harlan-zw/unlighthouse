<script lang="ts" setup>
import type { UnlighthouseColumn } from 'unlighthouse'

defineProps<{
  sorting: Record<string, 'desc' | 'asc' | undefined>
  column: UnlighthouseColumn
}>()

defineEmits<{
  (e: 'sort', key: string): void
}>()

function htmlTooltip(s: string) {
  // we need to convert links into html for example
  // [Learn more](https://web.dev/lighthouse-largest-contentful-paint/) -> <a href="https://web.dev/lighthouse-largest-contentful-paint/">Learn more</a>
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
      <tooltip v-if="column.tooltip">
        <span class="whitespace-nowrap flex items-center">{{ column.label }}
          <UIcon v-if="column?.warning" name="i-carbon-warning-alt" class="text-yellow-500 ml-1 text-xs opacity-75" />
          <UIcon v-else name="i-carbon-information" class="ml-1 text-xs opacity-75" />
        </span>
        <template #tooltip>
          <div v-html="htmlTooltip(column.tooltip)" />
        </template>
      </tooltip>
      <div v-else>
        <span class="whitespace-nowrap">{{ column.label }}</span>
      </div>
      <button
        v-if="(column.sortable || !!column.sortKey) && column.key"
        class="ml-2 p-0.3 dark:border-none dark:bg-blue-900/20 border-2 border-blue-100 ring-blue-200 hover:ring-1 rounded-lg"
        :class="sorting.key === column.key && sorting.dir ? ['dark:bg-blue-900/70', 'bg-blue-900', 'text-blue-200'] : []"
        @click="$emit('sort', column.key)"
      >
        <UIcon v-if="sorting.key !== column.key || !sorting.dir" name="i-carbon-chevron-sort" />
        <UIcon v-else-if="sorting.key === column.key && sorting.dir === 'desc'" name="i-carbon-chevron-sort-down" />
        <UIcon v-else-if="sorting.key === column.key && sorting.dir === 'asc'" name="i-carbon-chevron-sort-up" />
      </button>
    </div>
    <slot :name="column.slot || column.label" />
  </div>
</template>
