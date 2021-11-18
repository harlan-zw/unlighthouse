<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from "@shared"
import { categories, openLighthouseReportIframeModal } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn,
}>()
</script>
<template>
<loading-status-icon v-if="!report.report" :status="report.tasks.runLighthouseTask" />
<button v-else
        :class="[`grid-cols-${categories.length}`]" class="grid gap-2 hover:bg-blue-900/50 transition p-2 rounded"
        title="Open Lighthouse Report"
        @click="openLighthouseReportIframeModal(report)"
>
  <div v-for="(val, ck) in report.report.categories" :key="ck">
    <metric-guage :score="val.score" :label="val.title" />
  </div>
</button>
</template>
