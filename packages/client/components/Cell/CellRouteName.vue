<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { apiUrl, categories, device, iframeModalUrl, isModalOpen, isOffline, resolveArtifactPath } from '../../logic'

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

const fetchTime = computed(() => {
  // use Intl to format the date
  const date = new Date(props.report.report.fetchTime)
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
})

const thumbnail = computed(() => {
  const mobileProps = device === 'mobile' ? { class: 'w-68px h-112px' } : { class: 'h-82px w-112px' }
  if (categories.includes('performance')) {
    return {
      src: resolveArtifactPath(props.report, '/screenshot.jpeg'),
      ...mobileProps,
    }
  }
  return {
    src: resolveArtifactPath(props.report, '/full-screenshot.jpeg'),
    ...mobileProps,
  }
})
</script>

<template>
  <div class="text-xs flex items-center w-full">
    <btn-action v-if="report.tasks.runLighthouseTask === 'completed'" class="hidden md:block" :style="{ flex: `0 0 ${device === 'mobile' ? '67' : '112'}px` }" title="Open Full Page Screenshot" @click="openModal()">
      <img v-bind="thumbnail" loading="lazy" height="82" width="112">
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
      <div class="opacity-60 mt-2">
        {{ fetchTime }}
      </div>
    </div>
  </div>
  <teleport v-if="isModalOpen && showingModal" to="#modal-portal">
    <img :src="resolveArtifactPath(props.report, '/full-screenshot.jpeg')" alt="full screenshot" class="mx-auto">
  </teleport>
</template>
