<script lang="ts" setup>
import {LH} from "lighthouse";
import { website } from '../../logic'

const props = defineProps<{
  report: {
    fullRoute: string
    route: {
      pathname: string
    }
    report: LH.Result,
  }
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
<div class="grid grid-cols-12 gap-4 text-sm text-gray-400">
  <div class="col-span-2">
    <div class="text-gray-300 text-sm mb-3 w-200px flex-basis-200px">
      <div class="mb-2">
        <a :href="report.route.url" target="_blank" class="underline">{{ report.route.path }}</a>
      </div>
      <template v-if="report.seo">
      <div class="text-xs opacity-60 mb-1">
        {{ report.seo?.title }}
      </div>
      </template>
    </div>
  </div>
  <template v-if="activeTab === 0">
  <div class="col-span-4 flex justify-start">
    <loading-spinner v-if="!report.report" class="h-20px" />
    <div v-else class="grid gap-5 grid-cols-4">
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
      <i-logos-vue class="h-10px"></i-logos-vue>
      <a class="inline ml-1 text-sm opacity-90" :href="`http://localhost:3000/api/__open-in-editor?file=${report.route.definition.component}`">
        {{ report.route.definition.componentBaseName }}
      </a>
    </div>
  </div>
  <div class="col-span-2">
    <img v-if="report.report" class="h-100px" height="100" :src="report.report.audits['final-screenshot'].details.data" />
  </div>
  </template>
  <template v-else-if="activeTab === 1 && report.report">
  <div class="col-span-1">
    <audit-result :value="report.report.audits['first-contentful-paint']" />
  </div>
  <div class="col-span-1">
    <audit-result :value="report.report.audits['total-blocking-time']" />
  </div>
  <div class="col-span-1">
    <audit-result :value="report.report.audits['cumulative-layout-shift']" />
  </div>
  <div class="col-span-2">
    {{ report.report.audits['diagnostics'].details.items[0].numRequests }}
    <div class="text-xs text-gray-500">
      {{ report.report.audits['diagnostics'].details.items[0].numScripts }} Scripts
    </div>
    <div class="text-xs text-gray-500">
      {{ report.report.audits['diagnostics'].details.items[0].numStylesheets }} Stylesheets
    </div>
    <div class="text-xs text-gray-500">
      {{ report.report.audits['diagnostics'].details.items[0].numFonts }} Fonts
    </div>
    <div class="text-xs text-gray-500">
      {{ report.report.audits['network-requests'].details.items.filter(i => i.resourceType === 'Image').length }} Images
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
  <div class="col-span-3">
    <div v-if="report.report.audits['color-contrast'].details.items" class="max-h-100px overflow-y-auto">
      <div
          v-for="({ node }, key) in report.report.audits['color-contrast'].details.items"
          :key="key"
          class="mb-1 p-1"
          :style="{
      color: findForegroundColor(node.explanation),
      backgroundColor: findBackgroundColor(node.explanation),
    }"
      >
        {{ node.nodeLabel }}
      </div>
    </div>
  </div>
  <div class="col-span-2">
    <audit-result-items-length :value="report.report.audits['image-alt']" />
  </div>
  <div class="col-span-2">
    <audit-result-items-length :value="report.report.audits['link-name']" />
  </div>
  </template>
  <template v-else-if="activeTab === 3">
  <div class="col-span-1">
    <audit-result-items-length :value="report.report.audits['errors-in-console']" />
  </div>
  <div class="col-span-2">
    <audit-result-items-length :value="report.report.audits['no-vulnerable-libraries']" />
  </div>
  <div class="col-span-2">
    <audit-result-items-length :value="report.report.audits['external-anchors-use-rel-noopener']" />
  </div>
  <div class="col-span-2">
    <audit-result-items-length :value="report.report.audits['image-aspect-ratio']" />
  </div>
  </template>
  <template v-else-if="activeTab === 4">
  <div class="col-span-1">
    <audit-result :value="report.report.audits['is-crawlable']" />
  </div>
  <div class="col-span-4 text-xs">
    {{ report.seo.description }}
  </div>
  <div class="col-span-2 text-xs">
    <img v-if="report.seo.image" :src="report.seo.image" width="200" height="100"/>
  </div>
  </template>
  <div class="col-span-2">
    <slot name="actions" :report="report" />
  </div>
</div>
</template>
