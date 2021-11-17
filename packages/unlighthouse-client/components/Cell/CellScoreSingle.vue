<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from "@shared"
import { activeTab } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn,
}>()
</script>
<template>
<loading-status-icon v-if="!report.report" :status="report.tasks.runLighthouseTask" />
<metric-guage v-else :score="report.report.categories[Object.keys(report.report.categories)[activeTab - 1]].score" :label="report.report.categories[Object.keys(report.report.categories)[activeTab - 1]].title" />
</template>
