<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from 'unlighthouse'
import { contentModalOpen, openContentModal } from '~/composables/state'
import CellImageOutline from './CellImageOutline.vue'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const showingModal = ref(false)
const activeItem = ref<any>(null)

function openModal(item: any) {
  activeItem.value = item
  openContentModal()
  nextTick(() => {
    showingModal.value = true
  })
}

watch(contentModalOpen, () => {
  if (!contentModalOpen.value) {
    showingModal.value = false
    activeItem.value = null
  }
})

const layoutShiftItems = computed(() => {
  const details = props.report.report?.audits?.['layout-shifts']?.details as any
  return details?.items || []
})
</script>

<template>
  <div v-if="report.report" class="text-sm w-full">
    <AuditResult :value="report.report.audits?.['cumulative-layout-shift'] as any" class="ml-2" />
    <div v-if="report.report.audits?.['layout-shifts']" class="max-h-[120px] overflow-y-auto">
      <div v-for="(item, key) in layoutShiftItems" :key="key" class="mb-2 flex items-center">
        <template v-if="item?.score && item.score.toFixed(3) !== '0.000'">
          <button title="Open full image" class="cursor-pointer" @click="openModal(item)">
            <CellImageOutline :item="item" :report="report" :column="column" :size="{ width: 150, height: 100 }" />
          </button>
          <AuditResult :value="{ displayValue: item.score.toFixed(3), score: 0 }" class="ml-2" />
          <Teleport v-if="activeItem === item && contentModalOpen && showingModal" to="#modal-portal">
            <CellImageOutline :item="item" :report="report" :column="column" :size="{ width: 365, height: 700 }" />
          </Teleport>
        </template>
      </div>
    </div>
  </div>
</template>
