<script lang="ts" setup>
import type { UnlighthouseRouteReport } from 'unlighthouse'
import { columns } from '~/composables/search'

defineProps<{
  report: UnlighthouseRouteReport
}>()

const resultColumns = computed(() => columns.value.flat())
</script>

<template>
  <div class="grid grid-cols-12 gap-4 text-sm min-h-[100px] motion-spring hover:bg-elevated/40 border-b border-default transition-colors">
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
