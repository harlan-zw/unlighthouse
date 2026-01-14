<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from 'unlighthouse'
import { openLighthouseReportIframeModal } from '~/composables/state'

defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()
</script>

<script lang="ts">
const categoryAbbrev: Record<string, string> = {
  'Performance': 'Perf',
  'Accessibility': 'A11y',
  'Best Practices': 'BP',
  'SEO': 'SEO',
}
</script>

<template>
  <LoadingStatusIcon v-if="!report.report && report.tasks.inspectHtmlTask === 'failed'" :status="report.tasks.inspectHtmlTask" />
  <LoadingStatusIcon v-else-if="!report.report" :status="report.tasks.runLighthouseTask" />
  <button
    v-else
    title="Open Lighthouse Report"
    class="cursor-pointer w-full"
    @click="openLighthouseReportIframeModal(report)"
  >
    <div class="flex gap-3">
      <div v-for="(val, ck) in report.report.categories" :key="ck" class="flex flex-col items-center">
        <MetricGuage :score="(val as any).score ?? undefined" stripped />
        <span class="text-[10px] opacity-50 mt-0.5">{{ categoryAbbrev[(val as any).title] || (val as any).title }}</span>
      </div>
    </div>
    <div class="text-xs opacity-60 mt-2 text-left flex items-center gap-1">
      <UIcon name="i-heroicons-document-text" class="w-3 h-3" />
      <span>View Report</span>
    </div>
  </button>
</template>
