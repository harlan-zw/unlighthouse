<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { apiUrl, device, categories, resolveArtifactPath } from '~/composables/unlighthouse'
import { isOffline, openContentModal } from '~/composables/state'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()

function openEditorRequest() {
  if (props.report.route.definition?.component) {
    fetch(`${apiUrl.value}/__launch?file=${props.report.route.definition.component}`)
  }
}

const fetchTime = computed(() => {
  const fetchTimeValue = props.report.report?.fetchTime
  if (!fetchTimeValue) return ''

  const date = new Date(fetchTimeValue)
  if (Number.isNaN(date.getTime())) return 'Invalid date'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
})

const thumbnail = computed(() => {
  const isMobile = device.value === 'mobile'
  const mobileProps = isMobile ? { class: 'w-[68px] h-[112px]' } : { class: 'h-[82px] w-[112px]' }

  if (!props.report) return { ...mobileProps, src: '' }

  if (categories.value.includes('performance')) {
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
    <button
      v-if="report.tasks.runLighthouseTask === 'completed'"
      class="hidden md:block cursor-pointer"
      :style="{ flex: `0 0 ${device === 'mobile' ? '67' : '112'}px` }"
      title="Open Full Page Screenshot"
      @click="openContentModal()"
    >
      <img v-bind="thumbnail" loading="lazy" height="82" width="112">
    </button>

    <div class="md:ml-3 grow w-full">
      <a v-if="report.seo?.title" :href="report.route.url" target="_blank" class="text-xs dark:opacity-80 underline hover:no-underline">
        {{ report.seo?.title }}
      </a>
      <a v-else :href="report.route.url" target="_blank" class="text-xs opacity-80 underline break-all hover:no-underline">
        {{ report.route.path }}
      </a>
      <div v-if="report.route.definition?.componentBaseName" class="flex items-center mt-2">
        <button
          :disabled="isOffline"
          class="inline text-xs opacity-90 rounded-xl px-2 bg-gray-100 dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-teal-700/70 hover:text-white disabled:opacity-50"
          title="Open File"
          @click="openEditorRequest"
        >
          <UIcon v-if="report.route.definition.componentBaseName.endsWith('.vue')" name="i-logos-vue" class="h-[8px] inline-block" />
          <UIcon v-else-if="report.route.definition.componentBaseName.endsWith('.md')" name="i-la-markdown" class="h-[12px] mr-1 inline-block" />
          {{ report.route.definition.componentBaseName.split('.')[0] }}
        </button>
      </div>
      <div v-if="report.report?.audits?.redirects?.score === 0" class="mt-2">
        <UBadge color="error" size="sm">
          Redirected
        </UBadge>
      </div>
      <div class="opacity-60 mt-2">
        {{ fetchTime }}
      </div>
    </div>
  </div>
</template>
