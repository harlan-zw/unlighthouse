<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from 'unlighthouse'
import { contentModalOpen, isOffline, openContentModal } from '~/composables/state'
import CellImageOutline from './CellImageOutline.vue'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const showingModal = ref(false)

function openModal() {
  if (isOffline.value)
    return
  openContentModal()
  nextTick(() => {
    showingModal.value = true
  })
}

watch(contentModalOpen, () => {
  if (!contentModalOpen.value)
    showingModal.value = false
})

const lcpItems = computed(() => {
  const details = props.report.report?.audits?.['largest-contentful-paint-element']?.details as any
  return details?.items?.[0]?.items || []
})
</script>

<template>
  <div v-if="report.report" class="text-sm w-full">
    <AuditResult :value="report.report.audits?.['largest-contentful-paint'] as any" class="ml-2" />
    <div v-for="(item, key) in lcpItems" :key="key" class="flex items-center">
      <button title="Open full image" class="cursor-pointer" @click="openModal">
        <CellImageOutline :item="item" :report="report" :column="column" :size="{ width: 150, height: 112 }" />
      </button>
      <Teleport v-if="contentModalOpen && showingModal" to="#modal-portal">
        <CellImageOutline :item="item" :report="report" :column="column" :size="{ width: 365, height: 700 }" />
      </Teleport>
    </div>
  </div>
</template>
