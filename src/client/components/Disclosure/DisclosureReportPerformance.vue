<script lang="ts" setup>
const props = defineProps<{
  routeName: string
  reports: {
    report: LH.Result
  }[]
}>()

const emit = defineEmits<{
  (e: 'openModal', report: LH.Result): void
}>()

const { reports } = toRefs(props)

const reportsScore = computed(() => {
  return Math.round(reports.value
      .map(c => c.report.categories.performance.score)
      .reduce(
          (s, a) => s + a, 0,
      ) / reports.value.length * 100) / 100
})
</script>
<template>
<disclosure-handle :label="routeName">
  <template #label>
  <div class="grid grid-cols-12 text-sm w-full">
    <div class="flex items-left col-span-2">
      {{ routeName }}
      <span v-if="reports.length > 1" class="text-xs text-gray-400/70 ml-1">
            {{ reports.length }} pages
          </span>
    </div>
    <div class="flex items-center col-span-2">
      <loading-spinner v-if="reports.length === 0 || !reportsScore" class="h-20px" />
      <metric-guage v-else :score="reportsScore" stripped />
    </div>
    <div class="col-span-2">
      {{ reports.map(r => r.report.audits['first-contentful-paint'].numericValue).reduce((s, a) => s + a, 0,) }}
    </div>
  </div>
  </template>
  <template v-for="(report, index) in reports" :key="index">
  <div class="grid grid-cols-12 text-sm mb-3 text-gray-400">
    <div class="col-span-2">
      <div class="text-gray-300 text-sm mb-3 w-200px flex-basis-200px">
        <div class="mb-2">
          <div class="text-xs uppercase opacity-40 mb-1">
            URL
          </div><a :href="report.fullRoute" target="_blank" class="underline">{{ report.route.path }}</a>
        </div>
        <template v-if="report.seo">
        <div class="mb-2">
          <div class="text-xs uppercase opacity-40 mb-1">
            Title
          </div> {{ report.seo?.title }}
        </div>
        </template>
      </div>
    </div>
    <div class="col-span-2 flex justify-start">
      <div v-if="report.score" class="grid grid-cols-2">
        <metric-guage :score="report.report.categories.performance.score" label="Performance" />
      </div>
    </div>
    <div class="col-span-2">
     {{ report.report.audits['first-contentful-paint'].displayValue }}
    </div>
    <div class="col-span-2">
      {{ report.report.audits['total-blocking-time'].displayValue }}
    </div>
    <div class="col-span-2">
      {{ report.report.audits['cumulative-layout-shift'].displayValue }}
    </div>
    <div class="flex flex-col col-span-2">
      <div class="text-left">
        <button class="icon-btn text-lg mr-3" title="Refetch" @click="refetch()">
          <i-carbon-renew />
        </button>
        <button class="icon-btn text-lg" title="Refetch" @click="refetch()">
          <i-carbon-trash-can />
        </button>
      </div>
    </div>
  </div>
  </template>
</disclosure-handle>
</template>
