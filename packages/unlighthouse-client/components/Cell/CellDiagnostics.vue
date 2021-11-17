<script lang="ts" setup>
import get from "lodash/get";

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
}>()

const value = computed(() => get(props.report, props.column.key))
</script>
<template>
<div>
  {{ Math.round(value.details.items[0].totalByteWeight / 1024) }} kB
  <div class="text-xs text-gray-500">
    {{ Math.round(value.details.items[0].mainDocumentTransferSize / 1024) }} kB HTML
  </div>
</div>
</template>
