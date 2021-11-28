<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from "@shared"
import get from 'lodash/get'
import {useColumnClasses} from "../../logic/column";

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
}>()

const value = computed(() => {
  return get(props.report, props.column.key)
})

const { column: colRef } = toRefs(props);
const classes = useColumnClasses(colRef)
</script>
<template>
<div :class="classes" class="flex items-center">
  <slot></slot>
  <audit-result v-if="value?.scoreDisplayMode === 'error'" :value="{ score: 0, displayValue: value.errorMessage }" />
  <audit-result v-else-if="value?.scoreDisplayMode === 'notApplicable'" :value="{ score: null, displayValue: 'n/a' }" />
  <component v-else-if="column.component" :is="column.component" :report="report" :column="column" :value="value" />
  <template v-else-if="!!value">
  <div v-if="typeof value === 'number'" class="text-base font-mono">
    {{ value }}
  </div>
  <div v-else-if="typeof value === 'string'" class="text-xs opacity-80 font-mono">
    {{ value }}
  </div>
  <audit-result v-else-if="typeof value.displayValue !== 'undefined'" :value="value" />
  <audit-result-items-length v-else-if="!!value.details?.items" :value="value"  />
  <audit-result v-else-if="typeof value.score !== 'undefined'" :value="{ score: value.score }" />
  </template>
</div>
</template>
