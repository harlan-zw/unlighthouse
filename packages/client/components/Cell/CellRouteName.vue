<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { apiUrl, device, iframeModalUrl, isModalOpen, isOffline } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()

const showingModal = ref(false)

function openModal() {
  isModalOpen.value = true
  iframeModalUrl.value = null
  nextTick(() => {
    showingModal.value = true
  })
}
// reset on modal closing
watch(isModalOpen, () => {
  if (!isModalOpen.value)
    showingModal.value = false
})

function openEditorRequest() {
  fetch(`${apiUrl}/__launch?file=${props.report.route.definition.component}`)
}
</script>

<template>
  <div class="text-xs flex items-center w-full">
    <btn-action v-if="report.tasks.runLighthouseTask === 'completed'" class="hidden md:block" :style="{ flex: `0 0 ${device === 'mobile' ? '67' : '112'}px` }" title="Open Full Page Screenshot" @click="openModal()">
      <img v-if="device === 'mobile'" :src="`${report.artifactUrl}/screenshot.jpeg`" loading="lazy" height="112" width="68" class="object-fit w-68px h-112px">
      <img v-else :src="`${report.artifactUrl}/screenshot.jpeg`"  loading="lazy" height="82" width="112" class="object-fit h-82px w-112px">
    </btn-action>
    <div class="md:ml-3 flex-grow w-full">
      <a v-if="report.seo?.title" :href="report.route.url" target="_blank" class="text-xs dark:(opacity-80) underline hover:no-underline">
        {{ report.seo?.title }}
      </a>
      <a v-else :href="report.route.url" target="_blank" class="text-xs opacity-80 underline break-all hover:no-underline">
        {{ report.route.path }}
      </a>
      <div v-if="report.route.definition?.componentBaseName" class="flex items-center mt-2">
        <btn-action :disabled="isOffline ? 'disabled' : false" class="inline text-xs opacity-90 rounded-xl px-2 bg-blue-50 dark:(bg-teal-700/30 hover:bg-teal-700/70) hover:(text-opacity-100 bg-blue-100)" title="Open File" @click="openEditorRequest">
          <i-logos-vue v-if="report.route.definition.componentBaseName.endsWith('.vue')" class="h-8px inline-block" />
          <i-la-markdown v-else-if="report.route.definition.componentBaseName.endsWith('.md')" class="h-12px mr-1 inline-block" />
          {{ report.route.definition.componentBaseName.split('.')[0] }}
        </btn-action>
      </div>
      <div v-if="report.report?.audits?.redirects?.score === 0" class="mt-2">
        <div class="font-bold inline text-xs uppercase px-1 rounded-xl bg-red-300 text-red-700">
          Redirected
        </div>
      </div>
    </div>
  </div>
  <teleport v-if="isModalOpen && showingModal" to="#modal-portal">
    <img :src="`${report.artifactUrl}/full-screenshot.jpeg`" alt="full screenshot" class="mx-auto">
  </teleport>
</template>
