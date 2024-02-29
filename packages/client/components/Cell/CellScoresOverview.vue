<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { categories, openLighthouseReportIframeModal } from '../../logic'

defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()
</script>

<template>
  <loading-status-icon v-if="!report.report && report.tasks.inspectHtmlTask === 'failed'" :status="report.tasks.inspectHtmlTask" />
  <loading-status-icon v-else-if="!report.report" :status="report.tasks.runLighthouseTask" />
  <btn-action
    v-else
    title="Open Lighthouse Report"
    @click="openLighthouseReportIframeModal(report)"
  >
    <div class="grid gap-2 flex" :class="[`grid-cols-${categories.length}`]">
      <div v-for="(val, ck) in report.report.categories" :key="ck">
        <metric-guage :score="val.score" :label="val.title" />
      </div>
    </div>
    <div class="text-xs opacity-80 mt-2 text-left flex items-center gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 32 32" class="w-4 h-4"><path fill="currentColor" d="M15 20h2v4h-2zm5-2h2v6h-2zm-10-4h2v10h-2z"/><path fill="currentColor" d="M25 5h-3V4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v1H7a2 2 0 0 0-2 2v21a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2M12 4h8v4h-8Zm13 24H7V7h3v3h12V7h3Z"/></svg>
      <span>View Lighthouse Report</span>
    </div>
  </btn-action>
</template>
