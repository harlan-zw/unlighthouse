<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { categories, openLighthouseReportIframeModal } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()
</script>

<template>
  <loading-status-icon v-if="!report.report && report.tasks.inspectHtmlTask === 'failed'" :status="report.tasks.inspectHtmlTask" />
  <loading-status-icon v-else-if="!report.report" :status="report.tasks.runLighthouseTask" />
  <btn-action
    v-else
    :class="[`grid-cols-${categories.length}`]"
    class="grid gap-2 flex"
    title="Open Lighthouse Report"
    @click="openLighthouseReportIframeModal(report)"
  >
    <div v-for="(val, ck) in report.report.categories" :key="ck">
      <metric-guage :score="val.score" :label="val.title" />
    </div>
  </btn-action>
</template>
