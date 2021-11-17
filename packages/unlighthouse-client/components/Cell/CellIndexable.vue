<script lang="ts" setup>
import get from "lodash/get";

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
}>()

const value = computed(() => get(props.report, props.column.key))
</script>
<template>
<div class="flex w-full justify-center">
<audit-result :value="{ score: value.score }"/>
</div>
</template>
