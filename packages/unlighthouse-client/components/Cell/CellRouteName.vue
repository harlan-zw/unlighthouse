<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from "@shared"
import { openFullScreenshotIframeModal, apiUrl, hasRouteDefinitions } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
  value: any
}>()

</script>
<template>
<div class="text-xs flex items-center w-full">
  <btn-action class="hidden md:block" @click="openFullScreenshotIframeModal(report)" style="flex: 0 0 67px;" title="Open Full Page Screenshot">
    <img v-if="report.report?.audits?.['final-screenshot']?.details?.data" :src="report.report.audits['final-screenshot'].details.data" height="112" width="68" class="w-68px h-112px">
  </btn-action>
  <div class="md:ml-3 flex-grow w-full">
    <a v-if="report.seo?.title" :href="report.route.url" target="_blank" class="text-xs dark:(opacity-80) underline">
      {{ report.seo?.title }}
    </a>
    <a v-else :href="report.route.url" target="_blank" class="text-xs opacity-80 underline break-all">
      {{ report.route.path }}
    </a>
    <div v-if="hasRouteDefinitions" class="flex items-center mt-2">
      <i-logos-vue class="h-8px"></i-logos-vue>
      <a class="inline text-xs opacity-90" :href="`${apiUrl}/__open-in-editor?file=${report.route.definition.component}`">
        {{ report.route.definition.componentBaseName.replace('.vue', '') }}
      </a>
    </div>
    <div v-if="report.report?.audits?.['redirects']?.score === 0" class="mt-2">
      <div class="font-bold inline text-xs uppercase px-1 rounded-xl bg-red-300 text-red-700">
        Redirected
      </div>
    </div>
  </div>
</div>
</template>
