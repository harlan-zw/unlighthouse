<script lang="ts" setup>
import { UnlighthouseRouteReport } from '@shared'
import { extractBgColor, extractFgColor } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
  activeTab: number
}>()
</script>
<template>
  <div class="grid grid-cols-12 gap-4 text-sm text-gray-400 even:bg-teal-800/50 py-2">
    <div class="col-span-2 flex items-center">
      <div class="text-gray-300 text-xs w-200px flex-basis-200px">
        <div class="mb-2">
          <a :href="report.route.url" target="_blank" class="underline">{{ report.route.path }}</a>
        </div>
        <template v-if="report.seo">
        <div class="text-xs opacity-60">
          {{ report.seo?.title }}
        </div>
        </template>
      </div>
    </div>
    <template v-if="activeTab === 0">
      <div class="col-span-4 flex justify-start items-center">
        <div v-if="!report.report">
          <div class="inline-block text-xs"><span>Status:</span> <loading-status-icon class="ml-1" :status="report.tasks.runLighthouseTask" /></div>
        </div>
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
      <div class="col-span-2 flex items-center">
        <div class="flex items-center">
          <i-logos-vue class="h-10px"></i-logos-vue>
          <a class="inline ml-1 text-sm opacity-90" :href="`http://localhost:3000/api/__open-in-editor?file=${report.route.definition.component}`">
            {{ report.route.definition.componentBaseName }}
          </a>
        </div>
      </div>
      <div class="col-span-2">
        <img v-if="report.report" class="h-80px object-cover w-full object-top" height="80" :src="report.report.audits['final-screenshot'].details.data" />
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
              color: extractFgColor(node.explanation),
              backgroundColor: extractBgColor(node.explanation),
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
        <img v-if="report.seo.image" :src="report.seo.image" width="200" height="100" />
      </div>
    </template>
    <div class="col-span-2 flex justify-end">
      <template v-if="report.report">
      <slot name="actions" :report="report" />
      </template>
    </div>
  </div>
</template>
