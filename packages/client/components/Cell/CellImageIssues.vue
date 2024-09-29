<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { sum } from 'lodash-es'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const imageIssues = computed(() => {
  return sum([
    props.report.report?.audits['unsized-images']?.details.items.length || 0,
    props.report.report?.audits['preload-lcp-image']?.details.items.length || 0,
    props.report.report?.audits['offscreen-images']?.details.items.length || 0,
    props.report.report?.audits['modern-image-formats']?.details.items.length || 0,
    props.report.report?.audits['uses-optimized-images']?.details.items.length || 0,
    props.report.report?.audits['efficient-animated-content']?.details.items.length || 0,
    props.report.report?.audits['uses-responsive-images']?.details.items.length || 0,
  ])
})
</script>

<template>
  <div>
    <audit-result :value="{ displayValue: imageIssues, score: imageIssues === 0 ? 1 : 0 }" />
  </div>
</template>
