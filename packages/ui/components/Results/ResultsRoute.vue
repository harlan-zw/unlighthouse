<script lang="ts" setup>
import type { UnlighthouseRouteReport } from 'unlighthouse'

defineProps<{
  report: UnlighthouseRouteReport
}>()
</script>

<template>
  <div class="grid grid-cols-12 gap-4 text-sm dark:even:bg-teal-800/50 even:bg-teal-50/90 min-h-[100px] motion-spring hover:bg-blue-100/50 dark:hover:bg-teal-700/30">
    <template v-for="(col, i) in resultColumns" :key="i">
      <results-cell
        :column="col"
        :report="report"
      >
        <slot :name="col.slot" :report="report" />
      </results-cell>
    </template>
  </div>
</template>
