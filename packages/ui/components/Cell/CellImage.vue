<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { $URL, withBase } from 'ufo'
import { website } from '~/composables/unlighthouse'
import { isOffline, contentModalOpen, openContentModal } from '~/composables/state'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()

const image = computed(() => {
  if (props.value) {
    const $url = new $URL(props.value)
    if (!$url.hostname)
      return withBase(props.value, website.value)
  }
  return props.value
})

const showingModal = ref(false)

function openModal() {
  if (isOffline.value) return
  openContentModal()
  nextTick(() => {
    showingModal.value = true
  })
}

watch(contentModalOpen, () => {
  if (!contentModalOpen.value) showingModal.value = false
})
</script>

<template>
  <div>
    <button v-if="image" title="Open full image" class="cursor-pointer" @click="openModal">
      <img loading="lazy" class="h-[100px] object-contain w-full object-top object-left" height="100" :src="image" alt="share image">
    </button>
    <AuditResult v-else :value="{ displayValue: 'Missing', score: 0 }" />
    <Teleport v-if="image && contentModalOpen && showingModal" to="#modal-portal">
      <img :src="image" alt="share image" class="w-[1200px] max-w-full h-auto mx-auto">
    </Teleport>
  </div>
</template>
