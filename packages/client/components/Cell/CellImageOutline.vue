<script setup lang="ts">
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core/src'

const props = defineProps<{
  item: any
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  size: { width: number, height: number }
}>()

const maxRenderSizeDC = props.size

function computeZoomFactor(elementRectSC, renderContainerSizeDC) {
  const targetClipToViewportRatio = 0.75
  const zoomRatioXY = {
    x: renderContainerSizeDC.width / elementRectSC.width,
    y: renderContainerSizeDC.height / elementRectSC.height,
  }
  const zoomFactor = targetClipToViewportRatio * Math.min(zoomRatioXY.x, zoomRatioXY.y)
  return Math.min(1, zoomFactor)
}

function getScreenshotPositions(elementRectSC, elementPreviewSizeSC, screenshotSize) {
  function getElementRectCenterPoint(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  }
  function clamp(value, min, max) {
    if (value < min)
      return min
    if (value > max)
      return max
    return value
  }

  const elementRectCenter = getElementRectCenterPoint(elementRectSC)

  // Try to center clipped region.
  const screenshotLeftVisibleEdge = clamp(
    elementRectCenter.x - elementPreviewSizeSC.width / 2,
    0,
    screenshotSize.width - elementPreviewSizeSC.width,
  )
  const screenshotTopVisibleEdge = clamp(
    elementRectCenter.y - elementPreviewSizeSC.height / 2,
    0,
    screenshotSize.height - elementPreviewSizeSC.height,
  )

  return {
    screenshot: {
      left: screenshotLeftVisibleEdge,
      top: screenshotTopVisibleEdge,
    },
    clip: {
      left: elementRectSC.left - screenshotLeftVisibleEdge,
      top: elementRectSC.top - screenshotTopVisibleEdge,
    },
  }
}

const screenshot = ref(null)

onMounted(() => {
  const img = new Image()
  img.onload = function () {
    screenshot.value = {
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
  }
  img.src = `${props.report.artifactUrl}/full-screenshot.jpeg`
})

const styles = computed(() => {
  if (!screenshot.value)
    return {}
  const elementRectSC = props.item.node.boundingRect

  const zoomFactor = computeZoomFactor(elementRectSC, maxRenderSizeDC)

  const elementPreviewSizeSC = {
    width: maxRenderSizeDC.width / zoomFactor,
    height: maxRenderSizeDC.height / zoomFactor,
  }
  elementPreviewSizeSC.width = Math.min(screenshot.value.width, elementPreviewSizeSC.width)
  /* This preview size is either the size of the thumbnail or size of the Lightbox */
  const elementPreviewSizeDC = {
    width: elementPreviewSizeSC.width * zoomFactor,
    height: elementPreviewSizeSC.height * zoomFactor,
  }

  const positions = getScreenshotPositions(
    elementRectSC,
    elementPreviewSizeSC,
    screenshot.value,
  )

  const image = {
    width: `${elementPreviewSizeDC.width}px`,
    height: `${elementPreviewSizeDC.height}px`,
    backgroundPositionY: `${-(positions.screenshot.top * zoomFactor)}px`,
    backgroundPositionX: `${-(positions.screenshot.left * zoomFactor)}px`,
    backgroundSize: `${screenshot.value.width * zoomFactor}px ${screenshot.value.height * zoomFactor}px`,
    backgroundImage: `url('${props.report.artifactUrl}/full-screenshot.jpeg')`,
  }

  const marker = {
    width: `${elementRectSC.width * zoomFactor}px`,
    height: `${elementRectSC.height * zoomFactor}px`,
    left: `${positions.clip.left * zoomFactor}px`,
    top: `${positions.clip.top * zoomFactor}px`,
  }

  return {
    image,
    marker,
  }
})
</script>

<template>
  <div class="relative overflow-hidden flex items-center">
    <div :style="styles.image" class="outline-2 outline-green-200 bg-no-repeat bg-white" />
    <div :style="styles.marker" class="absolute outline outline-2 outline-green-200" />
  </div>
</template>
