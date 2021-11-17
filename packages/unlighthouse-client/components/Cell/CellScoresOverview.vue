<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from "@shared"

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn,
}>()
</script>
<template>
<loading-status-icon v-if="!report.report" :status="report.tasks.runLighthouseTask" />
<div v-else class="grid gap-4 grid-cols-4">
  <div v-for="(val, ck) in report.report.categories" :key="ck">
    <metric-guage :score="val.score" :label="val.title" />
  </div>
</div>
</template>
