<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from "@shared"
import get from 'lodash/get'

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
}>()

const value = computed(() => {
  return get(props.report, props.column.key)
})
</script>
<template>
<div :class="[`col-span-` + (column.cols || 2), ...(column.classes || [])]" class="flex items-center">
  <slot></slot>
  <component v-if="column.component" :is="column.component" :report="report" :column="column" :value="value" />
  <template v-else-if="!!value">
  <div v-if="typeof value === 'string'" class="text-xs opacity-80">
    {{ value }}
  </div>
  <audit-result v-else-if="typeof value.displayValue !== 'undefined'" :value="value" />
  <audit-result-items-length v-else-if="!!value.details?.items" :value="value"  />
  </template>
</div>
</template>
