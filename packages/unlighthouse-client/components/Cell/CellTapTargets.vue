<script lang="ts" setup>
import get from "lodash/get";

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn,
  value: any
}>()

const value = computed(() => get(props.report, props.column.key))
</script>
<template>
<audit-result :value="{ score: value.score, displayValue: value.displayValue.replace(' appropriately sized tap targets', '') }" />
</template>
