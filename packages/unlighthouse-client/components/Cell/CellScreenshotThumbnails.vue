<script lang="ts" setup>
import get from "lodash/get";

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
}>()

const value = computed(() => get(props.report, props.column.key))
</script>
<template>
<div class="w-full flex">
  <img v-for="(image, key) in value.details.items" :src="image.data" height="120" class="h-120px">
</div>
</template>
