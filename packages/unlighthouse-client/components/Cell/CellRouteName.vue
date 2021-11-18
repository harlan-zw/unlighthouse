<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from "@shared"
import { hasDefinitions, groupRoutes, openFullScreenshotIframeModal } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
}>()

</script>
<template>
<div class="text-gray-300 text-xs flex items-center">
  <button @click="openFullScreenshotIframeModal(report)" class="w-full max-w-[67px]">
    <img v-if="report.report?.audits?.['final-screenshot']" :src="report.report.audits['final-screenshot'].details.data" height="112" width="68" class="w-68px h-112px">
  </button>
  <div class="ml-3">
    <a :href="report.route.url" target="_blank" class="underline opacity-60">
      <template v-if="report.seo?.title">
      <div class="text-xs opacity-80 mb-2">
        {{ report.seo?.title }}
      </div>
      </template>
      <span v-if="!report.seo?.title && !hasDefinitions && !groupRoutes">
      {{ report.route.path }}
        </span>
    </a>
  </div>
</div>
</template>
