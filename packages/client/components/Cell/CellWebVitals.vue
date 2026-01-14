<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from 'unlighthouse'

defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()
</script>

<template>
  <div v-if="report.report">
    <div class="text-sm w-full grid gap-3 grid-cols-1 mb-2">
      <div class="flex justify-between items-center">
        <tooltip>
          <span class="whitespace-nowrap flex items-center">LCP <UIcon name="i-carbon-information" class="ml-1 text-xs opacity-75" /></span>
          <template #tooltip>
            <div class="font-bold mb-2">
              {{ report.report.audits['largest-contentful-paint'].title }}
            </div>
            <div>{{ report.report.audits['largest-contentful-paint'].description }}</div>
          </template>
        </tooltip>
        <audit-result :value="report.report.audits['largest-contentful-paint']" class="ml-2" />
      </div>
      <div class="flex justify-between items-center">
        <tooltip>
          <span class="whitespace-nowrap flex items-center">FID <UIcon name="i-carbon-information" class="ml-1 text-xs opacity-75" /></span>
          <template #tooltip>
            <div class="font-bold mb-2">
              {{ report.report.audits['max-potential-fid'].title }}
            </div>
            <div>{{ report.report.audits['max-potential-fid'].description }}</div>
          </template>
        </tooltip>
        <audit-result :value="report.report.audits['max-potential-fid']" class="ml-2" />
      </div>
      <div class="flex justify-between items-center">
        <tooltip>
          <span class="whitespace-nowrap flex items-center">CLS <UIcon name="i-carbon-information" class="ml-1 text-xs opacity-75" /></span>
          <template #tooltip>
            <div class="font-bold mb-2">
              {{ report.report.audits['cumulative-layout-shift'].title }}
            </div>
            <div>{{ report.report.audits['cumulative-layout-shift'].description }}</div>
          </template>
        </tooltip>
        <audit-result :value="report.report.audits['cumulative-layout-shift']" class="ml-2" />
      </div>
    </div>
  </div>
</template>
