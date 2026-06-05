<script lang="ts" setup>
import type { ChartBrushRange } from '../../composables/useChartBrush'
import { AnimatePresence, motion } from 'motion-v'
import { computed } from 'vue'

// Brush overlay for time-series charts. Pairs with useChartBrush — pass through
// `dragRange`, `selectionLeft`, `selectionWidth`. Renders:
//   1. The translucent selection rect with dashed primary borders
//   2. Floating start + end date pills (inverted, anchored to rect edges)
//   3. Centred duration pill (primary, only when rect is wide enough)
// Day labels are formatted inline (Month Day) — generic enough that no caller
// has needed to customise so far.

const props = defineProps<{
  dragRange: ChartBrushRange | null
  selectionLeft: number
  selectionWidth: number
  /** Distance from the wrapper's bottom in px (default 36, leaves room for axis ticks). */
  bottomOffset?: number
  /** Minimum width before the duration pill renders (default 56px). */
  durationThreshold?: number
}>()

function formatDragDate(iso: string): string {
  if (!iso)
    return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

const startLabel = computed(() => formatDragDate(props.dragRange?.startDate ?? ''))
const endLabel = computed(() => formatDragDate(props.dragRange?.endDate ?? ''))
const durationLabel = computed(() => {
  const r = props.dragRange
  if (!r)
    return ''
  const days = r.endIdx - r.startIdx + 1
  return `${days} day${days === 1 ? '' : 's'}`
})
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-if="dragRange"
      key="chart-brush-rect"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :exit="{ opacity: 0 }"
      :transition="{ duration: 0.12, ease: 'easeOut' }"
      :style="{ left: `${selectionLeft}px`, width: `${selectionWidth}px`, bottom: `${bottomOffset ?? 36}px` }"
      class="absolute top-0 z-10 pointer-events-none bg-primary/10"
    />
    <motion.div
      v-if="dragRange"
      key="chart-brush-start"
      :initial="{ opacity: 0, y: 4 }"
      :animate="{ opacity: 1, y: 0 }"
      :exit="{ opacity: 0, y: 4 }"
      :transition="{ duration: 0.15, ease: 'easeOut' }"
      :style="{ left: `${selectionLeft}px`, bottom: `${bottomOffset ?? 36}px` }"
      class="absolute z-10 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-inverted text-inverted text-mini font-medium tabular-nums whitespace-nowrap pointer-events-none shadow-sm"
    >
      {{ startLabel }}
    </motion.div>
    <motion.div
      v-if="dragRange"
      key="chart-brush-end"
      :initial="{ opacity: 0, y: 4 }"
      :animate="{ opacity: 1, y: 0 }"
      :exit="{ opacity: 0, y: 4 }"
      :transition="{ duration: 0.15, ease: 'easeOut' }"
      :style="{ left: `${selectionLeft + selectionWidth}px`, bottom: `${bottomOffset ?? 36}px` }"
      class="absolute z-10 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-inverted text-inverted text-mini font-medium tabular-nums whitespace-nowrap pointer-events-none shadow-sm"
    >
      {{ endLabel }}
    </motion.div>
    <motion.div
      v-if="dragRange && selectionWidth > (durationThreshold ?? 56)"
      key="chart-brush-duration"
      :initial="{ opacity: 0, scale: 0.9 }"
      :animate="{ opacity: 1, scale: 1 }"
      :exit="{ opacity: 0, scale: 0.9 }"
      :transition="{ duration: 0.15, ease: 'easeOut' }"
      :style="{ left: `${selectionLeft + selectionWidth / 2}px` }"
      class="absolute top-2 z-10 -translate-x-1/2 px-2 py-0.5 rounded-full bg-primary/90 text-inverted text-label whitespace-nowrap pointer-events-none shadow-sm"
    >
      {{ durationLabel }}
    </motion.div>
  </AnimatePresence>
</template>
