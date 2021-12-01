<script lang="ts" setup>
import get from "lodash/get";
import {iframeModelUrl, isModalOpen, website} from '../../logic'
import {withBase, $URL} from 'ufo'
import {UnlighthouseColumn, UnlighthouseRouteReport} from "unlighthouse-utils";

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
  value: any
}>()

const image = computed(() => {
  if (props.value) {
    // need to fix up relative image URLs
    const $url = new $URL(props.value)
    if (!$url.hostname) {
      return withBase(props.value, website)
    }
  }
  return props.value
})

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
  if (!isModalOpen.value) {
    showingModal.value = false
  }
})
</script>
<template>
<div>
  <btn-action v-if="value" @click="openModal" title="Open full image">
    <img loading="lazy" class="h-100px object-contain w-full object-top object-left" height="100" :src="image" alt="share image" />
  </btn-action>
  <audit-result v-else :value="{ displayValue: 'Missing', score: 0 }" />
  <teleport v-if="isModalOpen && showingModal" to="#modal-portal">
    <img :src="image" alt="share image" class="mx-auto" />
  </teleport>
</div>
</template>
