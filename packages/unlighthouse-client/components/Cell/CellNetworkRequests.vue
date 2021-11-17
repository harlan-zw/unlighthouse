<script lang="ts" setup>
import get from "lodash/get";
import sum from "lodash/sum";
import {formatBytes} from "../../logic";

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
}>()

const value = computed(() => get(props.report, props.column.key))

const scriptRequests = computed(() => value.value.details.items.filter(i => i.resourceType === 'Script'))
const scriptRequestSize = computed(() => formatBytes(sum(scriptRequests.value.map(i => i.transferSize))))

const fontRequests = computed(() => value.value.details.items.filter(i => i.resourceType === 'Font'))
const fontRequestSize = computed(() => formatBytes(sum(fontRequests.value.map(i => i.transferSize))))

const imageRequests = computed(() => value.value.details.items.filter(i => i.resourceType === 'Image'))
const imageRequestSize = computed(() => formatBytes(sum(imageRequests.value.map(i => i.transferSize))))

const xhrRequests = computed(() => value.value.details.items.filter(i => i.resourceType === 'XHR'))
const xhrRequestSize = computed(() => formatBytes(sum(xhrRequests.value.map(i => i.transferSize))))

const preflightRequests = computed(() => value.value.details.items.filter(i => i.resourceType === 'Preflight'))
const preflightRequestSize = computed(() => formatBytes(sum(preflightRequests.value.map(i => i.transferSize))))
</script>
<template>
<div>
  {{ value.details.items.length }} total
  <div v-if="xhrRequests.length" class="text-xs text-gray-500">
    XHR: {{ xhrRequests.length }} ({{ xhrRequestSize }})
  </div>
  <div v-if="preflightRequests.length" class="text-xs text-gray-500">
    Preflight: {{ preflightRequests.length }}  ({{ preflightRequestSize }})
  </div>
  <div v-if="scriptRequests.length" class="text-xs text-gray-500">
    Script: {{ scriptRequests.length }}  ({{ scriptRequestSize }})
  </div>
  <div  v-if="report.report.audits['diagnostics'].details.items[0].numStylesheets" class="text-xs text-gray-500">
    {{ report.report.audits['diagnostics'].details.items[0].numStylesheets }} Stylesheets
  </div>
  <div v-if="fontRequests.length" class="text-xs text-gray-500">
    Font: {{ fontRequests.length }} ({{ fontRequestSize }})
  </div>
  <div v-if="imageRequests.length" class="text-xs text-gray-500">
    Image: {{ imageRequests.length }} ({{ imageRequestSize }})
  </div>
</div>
</template>
