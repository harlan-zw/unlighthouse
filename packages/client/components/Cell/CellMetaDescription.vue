<script lang="ts" setup>
import { get } from 'lodash-es'
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const value = computed(() => get(props.report, props.column.key))
const issue = computed(() => {
  if (!value.value)
    return 'empty'

  const length = value.value.length
  if (length <= 0)
    return 'empty'

  if (length < 50)
    return 'too-short'

  if (length >= 200)
    return 'too-long'

  return ''
})
const label = computed(() => {
  switch (issue.value) {
    case 'empty':
      return 'Missing'
    case 'too-short':
      return 'Short'
    case 'too-long':
      return 'Lengthy'
  }
  return ''
})
const score = computed(() => {
  switch (issue.value) {
    case 'empty':
      return 0
    case 'too-short':
    case 'too-long':
      return 0.6
  }
  return 1
})
</script>

<template>
  <div v-if="report.tasks.inspectHtmlTask === 'completed'">
    <div class="text-xs opacity-80 mb-2">
      {{ value }}
    </div>
    <div v-if="label">
      <audit-result :value="{ displayValue: label, score }" />
    </div>
  </div>
</template>
