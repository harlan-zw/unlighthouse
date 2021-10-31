<script lang="ts" setup>
const props = defineProps<{
  columns: { label: string
    sortable?: boolean
    key?: string
    cols?: number
    slot?: string
    classes?: string[]
  }[]
  sorting: Record<string, 'desc'|'asc'|undefined>
}>()

const emits = defineEmits<{
  (e: 'sort', key: string): void
}>()
</script>
<template>
  <div class="bg-blue-900/30">
    <div class="mb-3 px-4 py-2">
      <div class="grid grid-cols-12 text-sm text-gray-400">
        <div v-for="(column, key) in columns" :key="key" class="flex items-center" :class="[`col-span-${(column.cols || 2)}`, ...(column.classes || [])]">
          {{ column.label }}
          <button v-if="column.sortable && column.key" class="ml-1" @click="$emit('sort', column.key)">
            <i-carbon-chevron-sort v-if="!sorting[column.key]" />
            <i-carbon-chevron-sort-down v-else-if="sorting[column.key] === 'desc'" />
            <i-carbon-chevron-sort-up v-else />
          </button>
          <slot :name="column.slot || column.label">
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>
