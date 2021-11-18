<script lang="ts" setup>
import { resultColumns } from '../../logic'

const props = defineProps<{
  sorting: Record<string, 'desc'|'asc'|undefined>
}>()

const emits = defineEmits<{
  (e: 'sort', key: string): void
}>()
</script>
<template>
<div class="bg-blue-900/30">
  <div class="mb-3 pl-4 pr-10 py-1">
    <div class="grid grid-cols-12 gap-4 text-sm text-gray-400">
      <div v-for="(column, key) in resultColumns" :key="key" class="flex flex-col" :class="[`col-span-${(column.cols || 2)}`, ...(column.classes || [])]">
        <div class="flex items-center ">
          <tooltip v-if="column.tooltip">
            {{ column.label }}
            <template #tooltip>
            {{ column.tooltip }}
            </template>
          </tooltip>
          <div v-else>
            {{ column.label }}
          </div>
          <button
              v-if="(column.sortable || !!column.sortKey) && column.key"
              class="ml-2 p-0.5 bg-blue-900/20 hover:ring-1 rounded-lg"
              @click="$emit('sort', column.key)"
              :class="[sorting.key === column.key && sorting.dir ? 'bg-blue-900/70' : '']"
          >
            <i-carbon-chevron-sort v-if="sorting.key !== column.key || !sorting.dir" />
            <i-carbon-chevron-sort-down v-else-if="sorting.key === column.key && sorting.dir === 'desc'" />
            <i-carbon-chevron-sort-up v-else-if="sorting.key === column.key && sorting.dir === 'asc'" />
          </button>
        </div>
        <slot :name="column.slot || column.label">
        </slot>
      </div>
    </div>
  </div>
</div>
</template>
