<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { apiUrl, categories, device, isOffline, resolveArtifactPath } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()

function openEditorRequest() {
  if (props.report.route.definition?.component) {
    fetch(`${apiUrl}/__launch?file=${props.report.route.definition.component}`)
  }
}

const fetchTime = computed(() => {
  // Check if fetchTime exists and is valid
  const fetchTimeValue = props.report.report?.fetchTime
  if (!fetchTimeValue) {
    return 'No scan data'
  }

  // use Intl to format the date
  const date = new Date(fetchTimeValue)

  // Check if the date is valid
  if (Number.isNaN(date.getTime())) {
    return 'Invalid date'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
})

const thumbnail = computed(() => {
  const mobileProps = device === 'mobile' ? { class: 'w-68px h-112px' } : { class: 'h-82px w-112px' }

  // Check if report exists before trying to resolve artifact paths
  if (!props.report) {
    return { ...mobileProps, src: '' }
  }

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
    <modal-trigger v-if="report.tasks.runLighthouseTask === 'completed'">
      <template #trigger>
        <btn-action class="hidden md:block" :style="{ flex: `0 0 ${device === 'mobile' ? '67' : '112'}px` }" title="Open Full Page Screenshot">
          <img v-bind="thumbnail" loading="lazy" height="82" width="112">
        </btn-action>
      </template>
      <template #modal>
        <img :src="resolveArtifactPath(props.report, '/full-screenshot.jpeg')" alt="full screenshot" class="mx-auto">
      </template>
    </modal-trigger>

    <div class="md:ml-3 grow w-full">
      <a v-if="report.seo?.title" :href="report.route.url" target="_blank" class="text-xs dark:opacity-80 underline hover:no-underline">
        {{ report.seo?.title }}
      </a>
      <a v-else :href="report.route.url" target="_blank" class="text-xs opacity-80 underline break-all hover:no-underline">
        {{ report.route.path }}
      </a>
      <div v-if="report.route.definition?.componentBaseName" class="flex items-center mt-2">
        <btn-action :disabled="isOffline ? 'disabled' : false" class="inline text-xs opacity-90 rounded-xl px-2 bg-surface dark:hover:bg-teal-700/70 hover:text-white hover:bg-blue-100" title="Open File" @click="openEditorRequest">
          <i-logos-vue v-if="report.route.definition.componentBaseName.endsWith('.vue')" class="h-8px inline-block" />
          <i-la-markdown v-else-if="report.route.definition.componentBaseName.endsWith('.md')" class="h-12px mr-1 inline-block" />
          {{ report.route.definition.componentBaseName.split('.')[0] }}
        </btn-action>
      </div>
      <div v-if="report.report?.audits?.redirects?.score === 0" class="mt-2">
        <status-chip variant="error">
          Redirected
        </status-chip>
      </div>
      <div class="opacity-60 mt-2">
        {{ fetchTime }}
      </div>
    </div>
  </div>
</template>
