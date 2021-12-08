<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from 'unlighthouse-utils'
import { activeTab, openLighthouseReportIframeModal } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const categoryKey = computed(() => {
  if (!props.report.report?.categories)
    return null

  const tab = activeTab.value - 1
  const keys = Object.keys(props.report.report.categories)
  return keys[tab]
})
const category = computed(() => {
  if (!categoryKey.value)
    return null

  return props.report.report?.categories?.[categoryKey.value]
})
</script>
<template>
  <loading-status-icon v-if="!category" :status="report.tasks.runLighthouseTask" />
  <button
    v-else
    class="hover:bg-blue-900/50 transition lg:p-2 rounded"
    title="Open Lighthouse Report"
    @click="openLighthouseReportIframeModal(report, categoryKey)"
  >
    <metric-guage class="hidden lg:flex" :score="category.score" :label="category.title" />
    <metric-guage class="lg:hidden" :stripped="true" :score="category.score" :label="category.title" />
  </button>
</template>
