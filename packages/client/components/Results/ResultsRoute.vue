<script lang="ts" setup>
import type { UnlighthouseRouteReport } from '@unlighthouse/core'
import { resultColumns } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
}>()
</script>

<template>
  <div class="grid grid-cols-12 gap-4 text-sm dark:(even:bg-teal-800/50) even:bg-teal-50/90 px-2" :class="report?.report ? ['py-1'] : ['py-3']">
    <template v-for="(col, i) in resultColumns" :key="i">
      <results-cell :column="col" :report="report">
        <slot :name="col.slot" :report="report" />
      </results-cell>
    </template>
  </div>
</template>
