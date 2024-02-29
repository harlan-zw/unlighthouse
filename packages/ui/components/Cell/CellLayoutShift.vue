<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { iframeModalUrl, isModalOpen } from '../../logic'
import CellImageOutline from './CellImageOutline.vue'

defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const showingModal = ref(false)
const activeItem = ref(false)

function openModal(item) {
  activeItem.value = item
  isModalOpen.value = true
  iframeModalUrl.value = null
  nextTick(() => {
    showingModal.value = true
  })
}
// reset on modal closing
watch(isModalOpen, () => {
  if (!isModalOpen.value) {
    showingModal.value = false
    activeItem.value = false
  }
})
</script>

<template>
  <div v-if="report.report" class="text-sm w-full">
    <audit-result :value="report.report.audits['cumulative-layout-shift']" class="ml-2" />
    <div v-if="report.report.audits['layout-shift-elements']" class="max-h-120px overflow-y-auto">
      <div v-for="(item, key) in report.report.audits['layout-shift-elements'].details.items" :key="key" class="mb-2 flex items-center">
        <template v-if="item?.score && item.score.toFixed(3) !== '0.000'">
          <btn-action title="Open full image" @click="openModal(item)">
            <CellImageOutline :item="item" :report="report" :column="column" :size="{ width: 150, height: 100 }" />
          </btn-action>
          <audit-result :value="{ displayValue: item.score.toFixed(3), score: 0 }" class="ml-2" />
          <teleport v-if="activeItem === item && isModalOpen && showingModal" to="#modal-portal">
            <CellImageOutline :item="item" :report="report" :column="column" :size="{ width: 365, height: 700 }" />
          </teleport>
        </template>
      </div>
    </div>
  </div>
</template>
