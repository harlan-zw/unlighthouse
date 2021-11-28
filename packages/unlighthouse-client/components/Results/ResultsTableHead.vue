<script lang="ts" setup>
import {UnlighthouseColumn} from "@shared";
import {useColumnClasses} from "../../logic/column";

const props = defineProps<{
  sorting: Record<string, 'desc'|'asc'|undefined>
  column: UnlighthouseColumn
}>()

const emits = defineEmits<{
  (e: 'sort', key: string): void
}>()

const { column: colRef } = toRefs(props);
const classes = useColumnClasses(colRef)
</script>
<template>
<div
    :class="classes"
    class="flex flex-col"
>
  <div class="flex items-center ">
    <tooltip v-if="column.tooltip">
      <span class="whitespace-nowrap">{{ column.label }}</span>
      <template #tooltip>
      {{ column.tooltip }}
      </template>
    </tooltip>
    <div v-else>
      <span class="whitespace-nowrap">{{ column.label }}</span>
    </div>
    <button
        v-if="(column.sortable || !!column.sortKey) && column.key"
        class="ml-2 p-0.3 dark:(border-none bg-blue-900/20) border-2 border-blue-100 ring-blue-200 hover:ring-1 rounded-lg"
        @click="$emit('sort', column.key)"
        :class="sorting.key === column.key && sorting.dir ? ['dark:bg-blue-900/70', 'bg-blue-900', 'text-blue-200'] : []"
    >
      <i-carbon-chevron-sort v-if="sorting.key !== column.key || !sorting.dir" />
      <i-carbon-chevron-sort-down v-else-if="sorting.key === column.key && sorting.dir === 'desc'" />
      <i-carbon-chevron-sort-up v-else-if="sorting.key === column.key && sorting.dir === 'asc'" />
    </button>
  </div>
  <slot :name="column.slot || column.label">
  </slot>
</div>
</template>
