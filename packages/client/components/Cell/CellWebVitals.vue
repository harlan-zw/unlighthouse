<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { site } from '../../logic'

const isLocalhost = site.includes('localhost')

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

</script>
<template>
  <div v-if="report.report">
    <div class="text-sm w-full grid gap-4 grid-cols-2 mb-2 pr-2">
      <div class="flex justify-between items-center">
        <tooltip>
          <span class="whitespace-nowrap flex items-start">FCP</span>
          <template #tooltip>
            <div class="font-bold mb-2">
              {{ report.report.audits['first-contentful-paint'].title }}
            </div>
            <div>{{ report.report.audits['first-contentful-paint'].description }}</div>
          </template>
        </tooltip>
        <audit-result :value="report.report.audits['first-contentful-paint']" class="ml-2" />
      </div>
      <div class="flex justify-between items-center">
        <tooltip>
          <span class="whitespace-nowrap flex items-start">TBT</span>
          <template #tooltip>
            <div class="font-bold mb-2">
              {{ report.report.audits['total-blocking-time'].title }}
            </div>
            <div>{{ report.report.audits['total-blocking-time'].description }}</div>
          </template>
        </tooltip>
        <audit-result :value="report.report.audits['total-blocking-time']" class="ml-2" />
      </div>
      <div class="flex justify-between items-center">
        <tooltip>
          <span class="whitespace-nowrap flex items-start">FID</span>
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
          <span class="whitespace-nowrap flex items-start">TTI</span>
          <template #tooltip>
            <div class="font-bold mb-2">
              {{ report.report.audits['interactive'].title }}
            </div>
            <div>{{ report.report.audits['interactive'].description }}</div>
          </template>
        </tooltip>
        <audit-result :value="report.report.audits['interactive']" class="ml-2" />
      </div>
    </div>
    <div v-if="!isLocalhost" class="text-xs opacity-90">
      Variability in effect. Test with <a :href="`https://pagespeed.web.dev/report?url=${encodeURIComponent(report.route.url)}`" target="_blank" class="underline hover:no-underline">PageSpeed Insights</a>.
    </div>
  </div>
</template>
