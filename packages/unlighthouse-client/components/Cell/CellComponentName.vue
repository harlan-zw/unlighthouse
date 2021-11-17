<script lang="ts" setup>
import { UnlighthouseColumn, UnlighthouseRouteReport } from "@shared"
import { apiUrl } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
}>()

</script>
<template>
<div class="flex items-center">
  <i-logos-vue class="h-8px"></i-logos-vue>
  <a class="inline text-xs opacity-90" :href="`${apiUrl}/__open-in-editor?file=${report.route.definition.component}`">
    {{ report.route.definition.componentBaseName.replace('.vue', '') }}
  </a>
</div>
</template>
