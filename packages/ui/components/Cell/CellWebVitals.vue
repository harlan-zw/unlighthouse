<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/contracts'

defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()
</script>

<template>
  <div v-if="report.report">
    <div class="text-sm w-full grid gap-3 grid-cols-1 mb-2">
      <div class="flex justify-between items-center">
        <UiTooltip
          :title="report.report.audits?.['largest-contentful-paint']?.title"
          :description="report.report.audits?.['largest-contentful-paint']?.description"
        >
          <span class="whitespace-nowrap flex items-center">LCP <UIcon name="i-carbon-information" class="ml-1 text-xs opacity-75" /></span>
        </UiTooltip>
        <AuditResult :value="report.report.audits?.['largest-contentful-paint'] as any" class="ml-2" />
      </div>
      <div class="flex justify-between items-center">
        <UiTooltip
          :title="report.report.audits?.['max-potential-fid']?.title"
          :description="report.report.audits?.['max-potential-fid']?.description"
        >
          <span class="whitespace-nowrap flex items-center">FID <UIcon name="i-carbon-information" class="ml-1 text-xs opacity-75" /></span>
        </UiTooltip>
        <AuditResult :value="report.report.audits?.['max-potential-fid'] as any" class="ml-2" />
      </div>
      <div class="flex justify-between items-center">
        <UiTooltip
          :title="report.report.audits?.['cumulative-layout-shift']?.title"
          :description="report.report.audits?.['cumulative-layout-shift']?.description"
        >
          <span class="whitespace-nowrap flex items-center">CLS <UIcon name="i-carbon-information" class="ml-1 text-xs opacity-75" /></span>
        </UiTooltip>
        <AuditResult :value="report.report.audits?.['cumulative-layout-shift'] as any" class="ml-2" />
      </div>
    </div>
  </div>
</template>
