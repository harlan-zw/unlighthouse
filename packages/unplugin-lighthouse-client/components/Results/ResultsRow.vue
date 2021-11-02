<script lang="ts" setup>
const props = defineProps<{
  routeName: string
  activeTab: number
  reports: {
    report: LH.Result
  }[]
}>()

const { reports } = toRefs(props)

const reportsScore = computed(() => {
  return Math.round(reports.value.map(c => c.score).reduce((s, a) => s + a, 0) / reports.value.length * 100) / 100
})
</script>
<template>
<div>
  <disclosure-handle>
    <template #label>
    <div class="grid grid-cols-12 text-sm w-full">
      <div class="flex items-center col-span-2">
        {{ routeName }}
        <span v-if="reports.length > 1" class="text-xs text-gray-400/70 ml-2">
              {{ reports.length }} pages
            </span>
      </div>
      <div class="flex items-center col-span-2">
        <loading-spinner v-if="reports.length === 0 || !reportsScore" class="h-20px" />
        <metric-guage v-else :score="reportsScore" stripped />
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
