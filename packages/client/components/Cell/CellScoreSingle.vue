<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { activeTab, openLighthouseReportIframeModal, throttle, website } from '../../logic'

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

const isLocalhost = website.includes('localhost')
</script>

<template>
  <loading-status-icon v-if="!category" :status="report.tasks.runLighthouseTask" />
  <div v-else>
    <button
      class="hover:bg-blue-900/50 transition lg:p-2 rounded"
      title="Open Lighthouse Report"
      @click="openLighthouseReportIframeModal(report, category.key)"
    >
      <metric-guage class="hidden lg:flex" :score="category.score" :label="category.title" />
      <metric-guage class="lg:hidden" :stripped="true" :score="category.score" :label="category.title" />
      <div class="text-xs opacity-60 mt-1" style="font-size: 10px;">
        Lighthouse Report
      </div>
    </button>
    <div v-if="!isLocalhost && category.title === 'Performance'" class="text-xs text-center inline-flex whitespace-nowrap">
      <tooltip class="text-left">
        <UIcon name="i-carbon-warning" class="inline text-xs mx-1 opacity-70" />
        <template #tooltip>
          <div class="mb-2">
            Lighthouse is running with variability.<br>Performance scores should not be considered accurate.
          </div>
          <div>Unlighthouse is running <span class="underline">with{{ throttle ? '' : 'out' }} throttling</span> which will also effect scores.</div>
        </template>
      </tooltip>
      <a :href="`https://pagespeed.web.dev/report?url=${encodeURIComponent(report.route.url)}`" target="_blank" class="underline hover:no-underline opacity-70">PSI Test</a>
    </div>
  </div>
</template>
