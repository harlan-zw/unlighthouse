<script lang="ts" setup>
import type { UnlighthouseRouteReport } from '@unlighthouse/core'
import { resultColumns } from '../../logic'

defineProps<{
  report: UnlighthouseRouteReport
}>()
</script>

<template>
  <div class="grid grid-cols-12 gap-4 text-sm dark:(even:bg-teal-800/50) even:bg-teal-50/90 min-h-[100px]">
    <template v-for="(col, i) in resultColumns" :key="i">
      <results-cell :column="col" :report="report">
        <slot :name="col.slot" :report="report" />
      </results-cell>
    </template>
  </div>
</template>
