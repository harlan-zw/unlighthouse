<script lang="ts" setup>
import { UnlighthouseRouteReport } from '@shared'

const props = defineProps<{
  routeName: string
  activeTab: number
  reports: UnlighthouseRouteReport[]
}>()

const { reports } = toRefs(props)

const reportsScore = computed(() => {
  return Math.round(reports.value.map(c => c.report?.score).reduce((s, a) => s + a, 0) / reports.value.length * 100) / 100
})
</script>
<template>
  <div>
    <disclosure-handle>
      <template #label>
        <div class="grid grid-cols-12 gap-4 text-xs w-full">
          <div class="flex items-center col-span-2 text-gray-400/90">
            {{ routeName }}
            <span v-if="reports.length > 1" class="text-xs text-gray-400/70 ml-2">
              {{ reports.length }} urls
            </span>
          </div>
          <div class="flex items-center col-span-2">
            <metric-guage v-if="reportsScore" :score="reportsScore" stripped />
          </div>
        </div>
      </template>
      <template v-for="(report, index) in reports" :key="index">
        <results-route :active-tab="activeTab" :report="report">
          <template #actions>
            <slot name="actions" :report="report" />
          </template>
        </results-route>
      </template>
    </disclosure-handle>
  </div>
</template>
