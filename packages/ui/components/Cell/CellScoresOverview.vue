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
    <div class="text-xs opacity-60 mt-1 text-center" style="font-size: 10px;">
      View Report
    </div>
  </btn-action>
</template>
