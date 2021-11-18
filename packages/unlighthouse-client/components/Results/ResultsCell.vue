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
  <audit-result v-if="value?.scoreDisplayMode === 'error'" :value="{ score: 0, displayValue: value.errorMessage }" />
  <audit-result v-else-if="value?.scoreDisplayMode === 'notApplicable'" :value="{ score: null, displayValue: 'n/a' }" />
  <component v-else-if="column.component" :is="column.component" :report="report" :column="column" :value="value" />
  <template v-else-if="!!value">
  <div v-if="typeof value === 'string' || typeof value === 'number'" class="text-xs opacity-80">
    {{ value }}
  </div>
  <audit-result v-else-if="typeof value.displayValue !== 'undefined'" :value="value" />
  <audit-result-items-length v-else-if="!!value.details?.items" :value="value"  />
  </template>
</div>
</template>
