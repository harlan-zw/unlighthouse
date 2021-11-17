<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from "@shared"
import get from 'lodash/get'

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
}>()

const value = computed(() => {
  return get(props.report, props.column.key)
})
</script>
<template>
<div class="text-gray-300 text-xs flex items-center">
  <img :src="report.report.audits['final-screenshot'].details.data" height="120" class="h-120px mr-3">
  <div>
    <template v-if="report.seo">
    <div class="text-xs opacity-80 mb-2">
      {{ report.seo?.title }}
    </div>
    </template>
    <a :href="report.route.url" target="_blank" class="underline opacity-60">{{ report.route.path }}</a>
  </div>
</div>
</template>
