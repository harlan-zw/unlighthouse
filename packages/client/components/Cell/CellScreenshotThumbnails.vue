<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from 'unlighthouse'
import { openThumbnailsModal } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()

const screenshots = computed(() => props.value?.details?.items || [])

function openModal() {
  openThumbnailsModal(screenshots.value)
}
</script>

<template>
  <btn-action v-if="screenshots.length > 0" title="Open page load timeline" class="w-full" @click="openModal">
    <div class="w-full flex justify-between">
      <img v-for="(image, key) in screenshots" :key="key" loading="lazy" :src="image.data" height="120" class="max-w-[10%] max-h-[120px] h-auto w-[10%]" alt="">
    </div>
  </btn-action>
</template>
