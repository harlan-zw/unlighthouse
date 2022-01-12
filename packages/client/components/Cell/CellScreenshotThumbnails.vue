<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { apiUrl, iframeModelUrl, isModalOpen } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()

const showingModal = ref(false)

const openModal = () => {
  isModalOpen.value = true
  iframeModelUrl.value = null
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
  <btn-action v-if="value" title="Open full image" class="w-full" @click="openModal">
    <div class="w-full flex justify-between">
      <template v-if="value?.details?.items">
        <img v-for="(image, key) in value.details.items" :key="key" :src="image.data" height="120" class="max-w-[10%] max-h-120px h-auto w-10%">
      </template>
    </div>
    <teleport v-if="isModalOpen && showingModal" to="#modal-portal">
      <h2 class="font-bold text-lg mb-1 text-gray-700 dark:text-gray-300">
        Screenshot Thumbnails
      </h2>
      <p class="mb-5 text-gray-600 dark:text-gray-400">
        This is what the load of your site looked like, 300ms apart.
      </p>
      <img v-for="(image, key) in value.details.items" :key="key" :src="image.data" width="120" class="w-120px h-auto inline">
    </teleport>
  </btn-action>
</template>
