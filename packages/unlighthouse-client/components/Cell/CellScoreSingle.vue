<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from "@shared"
import { activeTab, openLighthouseReportIframeModal } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn,
}>()
</script>
<template>
<loading-status-icon v-if="!report.report" :status="report.tasks.runLighthouseTask" />
<button v-else
        class="hover:bg-blue-900/50 transition p-2 rounded"
        title="Open Lighthouse Report"
        @click="openLighthouseReportIframeModal(report, Object.keys(report.report.categories)[activeTab - 1])"
>
  <metric-guage :score="report.report.categories[Object.keys(report.report.categories)[activeTab - 1]].score" :label="report.report.categories[Object.keys(report.report.categories)[activeTab - 1]].title" />
</button>
</template>
