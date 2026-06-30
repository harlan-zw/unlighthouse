<script lang="ts" setup>
import type { ChartAnnotation } from '../../utils/chartAnnotations'
import { computed } from 'vue'
import { resolveAnnotationMarkers } from '../../utils/chartAnnotations'

// Annotation marker overlay: thin vertical lines + interactive dots at specific
// x-positions, for any time-series chart. Extracted from UiChartFrame so charts
// that compose unovis directly (CWV, indexing) get the same markers without
// adopting the whole tooltip/brush frame.
//
// Positioning: drop this INSIDE the chart's plot wrap (the element whose box is
// `position: relative` and whose width == the plot x-span, i.e. a chart drawn
// with zero horizontal margin). Each marker is `position: absolute` with a CSS
// left-percentage; `width: 0` so it never affects layout, `-translate-x-1/2` to
// centre on the anchor. `bottom-9` (36px) clears a standard x-axis label band.

const { annotations, xDomain } = defineProps<{
  /** Event annotations. Empty/undefined renders nothing. */
  annotations?: ChartAnnotation[]
  /** Visible x range [min, max] (Date | ISO string | epoch-ms). Required to position. */
  xDomain?: [Date | string | number, Date | string | number]
}>()

const markers = computed(() => resolveAnnotationMarkers(annotations, xDomain))
</script>

<template>
  <div
    v-for="m in markers"
    :key="m.id"
    class="absolute top-0 bottom-9 z-[5] pointer-events-none w-0"
    :style="{ left: m.leftPct }"
    aria-hidden="true"
  >
    <!-- Thin 1px vertical marker line centred on the anchor point. -->
    <div class="absolute inset-y-0 w-px -translate-x-1/2 opacity-50" :class="m.toneClass" />
    <!-- 6px anchor dot at the bottom edge; pointer-events-auto restores hover so
         the native title shows the label on the zero-width overlay. -->
    <div
      class="absolute bottom-0 size-1.5 rounded-full -translate-x-1/2 pointer-events-auto cursor-default"
      :class="m.toneClass"
      :title="m.label"
    />
  </div>
</template>
