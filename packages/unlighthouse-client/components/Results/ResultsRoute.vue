<script lang="ts" setup>
import { UnlighthouseRouteReport} from '@shared'
import { resultColumns, } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
}>()
</script>
<template>
<div class="grid grid-cols-12 gap-4 text-sm text-gray-400 even:bg-teal-800/50 py-2">
  <template v-for="(col, i) in resultColumns" :key="i">
  <results-cell :column="col" :report="report">
    <slot :name="col.slot" :report="report" />
  </results-cell>
  </template>
</div>
</template>
