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
  return Math.round(reports.value.map(c => c.score).reduce((s, a) => s + a, 0) / reports.value.length * 100) / 100
})
</script>
<template>
<disclosure-handle :label="routeName">
  <template v-slot:label>
  <div class="grid grid-cols-12 text-sm w-full">
    <div class="flex items-left col-span-2">
      {{ routeName }}
      <span v-if="reports.length > 1" class="text-xs text-gray-400/70 ml-1">
        {{ reports.length}} pages
      </span>
    </div>
    <div class="flex items-center col-span-2">
      <loading-spinner v-if="reports.length === 0 || !reportsScore" class="h-20px" />
      <metric-guage v-else :score="reportsScore" stripped />
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
        <div v-for="(val, ck) in report.report.categories" :key="ck">
          <metric-guage :score="val.score" :label="val.title" />
        </div>
      </div>
    </div>
    <div class="col-span-2">
      <div class="text-xs uppercase opacity-40 mb-1">
        Page
      </div>
      <div class="flex items-center">
        <i-logos-vue class="h-12px"></i-logos-vue>
        <a class="inline ml-1" :href="`http://localhost:3000/__open-in-editor?file=${report.route.component}`">{{ report.route.component }}</a>
      </div>
      <div class="text-xs uppercase opacity-40 mb-1 mt-3">
        Layout
      </div>
      <div class="flex">
        <i-logos-vue></i-logos-vue>
        <a class="inline ml-1" target="_blank" href="http://localhost:3000/__open-in-editor?file=layouts/default.vue">{{ report.route.layout }}</a>
      </div>
    </div>
    <div class="col-span-2">
      <img v-if="report.report" class="h-160px" height="160" :src="report.report.audits['final-screenshot'].details.data" />
    </div>
    <div class="col-span-2">
    </div>
    <div class="flex flex-col col-span-2">
      <div class="text-left">
        <button
            v-if="report.report"
            type="button"
            class="mb-3 px-4 py-2 text-sm font-medium text-white bg-black rounded-md bg-opacity-20 hover:bg-opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
            @click="$emit('openModal', report)"
        >
          View Lighthouse Result
        </button>
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
