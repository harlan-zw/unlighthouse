<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { $URL, withBase } from 'ufo'
import { iframeModalUrl, isModalOpen, isOffline, website } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()

const image = computed(() => {
  if (props.value) {
    // need to fix up relative image URLs
    const $url = new $URL(props.value)
    if (!$url.hostname)
      return withBase(props.value, website)
  }
  return props.value
})

const showingModal = ref(false)

function openModal() {
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
  <div>
    <btn-action v-if="image" title="Open full image" @click="openModal">
      <img loading="lazy" class="h-100px object-contain w-full object-top object-left" height="100" :src="image" alt="share image">
    </btn-action>
    <audit-result v-else :value="{ displayValue: 'Missing', score: 0 }" />
    <teleport v-if="image && isModalOpen && showingModal" to="#modal-portal">
      <img :src="image" alt="share image" class="mx-auto">
    </teleport>
  </div>
</template>
