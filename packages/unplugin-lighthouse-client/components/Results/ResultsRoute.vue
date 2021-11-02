<script lang="ts" setup>
const props = defineProps<{
  report: LH.Result,
  activeTab: number
}>()

const findBackgroundColor = (str: string) => {
  const regex = /background color: (.*?),/gm
  let m
  // eslint-disable-next-line no-cond-assign
  while ((m = regex.exec(str)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex)
      regex.lastIndex++

    // The result can be accessed through the `m`-variable.
    return m[1]
    // m.forEach((match, groupIndex) => {
    //   console.log(`Found match, group ${groupIndex}: ${match}`)
    // })
  }
}

const findForegroundColor = (str: string) => {
  const regex = /foreground color: (.*?),/gm
  let m
  // eslint-disable-next-line no-cond-assign
  while ((m = regex.exec(str)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex)
      regex.lastIndex++

    // The result can be accessed through the `m`-variable.
    return m[1]
    // m.forEach((match, groupIndex) => {
    //   console.log(`Found match, group ${groupIndex}: ${match}`)
    // })
  }
}
</script>
<template>
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
  <template v-if="activeTab === 0">
  <div class="col-span-4 flex justify-start">
    <loading-spinner v-if="!report.report" class="h-20px" />
    <div v-else-if="report.score" class="grid gap-5 grid-cols-4">
      <div v-for="(val, ck) in report.report.categories" :key="ck">
        <metric-guage :score="val.score" :label="val.title" />
      </div>
    </div>
  </div>
  </template>
  <template v-else>
  <div class="col-span-1 flex justify-start">
    <loading-spinner v-if="!report.report" class="h-20px" />
    <metric-guage v-else :score="report.report.categories[Object.keys(report.report.categories)[activeTab - 1]].score" :label="report.report.categories[Object.keys(report.report.categories)[activeTab - 1]].title" />
  </div>
  </template>
  <template v-if="activeTab === 0">
  <div class="col-span-2">
    <div class="flex items-center">
      <i-logos-vue class="h-12px"></i-logos-vue>
      <a class="inline ml-1" :href="`http://localhost:3000/__open-in-editor?file=${report.route.component}`">{{ report.route.component }}</a>
    </div>
  </div>
  <div class="col-span-2">
    <img v-if="report.report" class="h-100px" height="100" :src="report.report.audits['final-screenshot'].details.data" />
  </div>
  </template>
  <template v-else-if="activeTab === 1">
  <div class="col-span-1">
    {{ report.report.audits['first-contentful-paint'].displayValue }}
  </div>
  <div class="col-span-1">
    {{ report.report.audits['total-blocking-time'].displayValue }}
  </div>
  <div class="col-span-1">
    {{ report.report.audits['cumulative-layout-shift'].displayValue }}
  </div>
  <div class="col-span-2">
    {{ report.report.audits['diagnostics'].details.items[0].numRequests }}
    <div class="text-xs text-gray-500">
      {{ report.report.audits['diagnostics'].details.items[0].numScripts }} Scripts
    </div>
    <div class="text-xs text-gray-500">
      {{ report.report.audits['diagnostics'].details.items[0].numStylesheets }} Stylesheets
    </div>
  </div>
  <div class="col-span-2">
    {{ Math.round(report.report.audits['diagnostics'].details.items[0].totalByteWeight / 1024) }} kB
    <div class="text-xs text-gray-500">
      {{ Math.round(report.report.audits['diagnostics'].details.items[0].mainDocumentTransferSize / 1024) }} kB HTML
    </div>
  </div>
  </template>
  <template v-else-if="activeTab === 2">
  <div class="col-span-4">
    <template v-if="report.report.audits['color-contrast'].details.items">
    <div
        v-for="({ node }, key) in report.report.audits['color-contrast'].details.items"
         :key="key"
         :style="{
      color: findForegroundColor(node.explanation),
      backgroundColor: findBackgroundColor(node.explanation),
    }"
    >
      {{ node.nodeLabel }}
      </div>
    </template>
  </div>
  <div class="col-span-3">
  </div>
  </template>
  <template v-else-if="activeTab === 4">
  <div class="col-span-1">
    <i-carbon-checkmark-outline v-if="report.report.audits['is-crawlable'].score === 1" class="text-green-500" />
    <i-carbon-close-outline v-else class="text-red-500" />
  </div>
  <div class="col-span-3 text-xs">
    {{ report.seo.description }}
  </div>
  </template>
  <div class="flex flex-col col-span-2">
    <slot name="actions" :report="report" />
  </div>
</div>
</template>
