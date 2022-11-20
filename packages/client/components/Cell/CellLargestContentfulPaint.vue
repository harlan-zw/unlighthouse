<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { iframeModalUrl, isModalOpen, isOffline } from '../../logic'
import CellImageOutline from './CellImageOutline.vue'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const showingModal = ref(false)

const openModal = () => {
  // don't open modal if we're offline
  if (isOffline.value)
    return

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
</script>

<template>
  <div v-if="report.report" class="text-sm w-full">
    <audit-result :value="report.report.audits['largest-contentful-paint']" class="ml-2" />
    <div v-for="(item, key) in report.report.audits['largest-contentful-paint-element'].details.items" :key="key" class="flex items-center">
      <btn-action title="Open full image" @click="openModal">
        <CellImageOutline :item="item" :report="report" :column="column" :size="{ width: 150, height: 112 }" />
      </btn-action>
      <teleport v-if="isModalOpen && showingModal" to="#modal-portal">
        <CellImageOutline :item="item" :report="report" :column="column" :size="{ width: 365, height: 700 }" />
      </teleport>
    </div>
  </div>
</template>
