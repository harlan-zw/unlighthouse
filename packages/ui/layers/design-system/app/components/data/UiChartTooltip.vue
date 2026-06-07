<script lang="ts" setup>
import type { MotionValue } from 'motion-v'
import { AnimatePresence, motion } from 'motion-v'

// Single floating readout for time-series chart hover. Anchored to the cursor
// position (spring-tracked x + y), sitting either above or below depending on
// available room. Inverted dark "pill" aesthetic with date + metric rows in
// one element — no companion crosshair pill, no chart-edge pinning.
//
// Position decomposition:
//   - Outer motion.div: spring-tracked translate to cursor (x, y) in chart
//     coordinates. Acts as the anchor point.
//   - Inner div: applies `-translate-x-1/2` (centre horizontally on cursor)
//     plus `-translate-y-full -mt-3` (anchor bottom edge above cursor) or
//     `mt-3` (anchor top edge below cursor) based on `placement`.
//
// Slots:
//   #header  — optional badge row (e.g. GSC's "Estimated")
//   default  — metric rows (each card decides layout)
//   #footer  — optional comparison-date strip

defineProps<{
  x: MotionValue<number>
  y: MotionValue<number>
  visible: boolean
  /** Date label always rendered on the leading row. */
  label: string
  /** Which side of the cursor the tooltip sits on. */
  placement?: 'above' | 'below'
}>()
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-if="visible"
      key="chart-tooltip"
      :initial="{ opacity: 0, scale: 0.96 }"
      :animate="{ opacity: 1, scale: 1 }"
      :exit="{ opacity: 0, scale: 0.96 }"
      :transition="{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }"
      :style="{ x, y }"
      class="absolute top-0 left-0 z-10 pointer-events-none"
    >
      <div
        class="min-w-[120px] max-w-[280px] rounded-md bg-inverted text-inverted shadow-sm -translate-x-1/2 transition-transform duration-150 ease-out" :class="[
          (placement ?? 'above') === 'above' ? '-translate-y-full -mt-3' : 'mt-3',
        ]"
      >
        <div
          v-if="$slots.header"
          class="px-2 pt-1.5 pb-1 border-b border-current/15 flex items-center gap-2"
        >
          <slot name="header" />
        </div>
        <div class="px-2 py-1 flex items-center gap-2 whitespace-nowrap">
          <span class="text-mini font-medium tabular-nums opacity-80">{{ label }}</span>
          <div v-if="$slots.default" class="h-3 w-px bg-current/20" />
          <div class="flex-1 flex flex-col gap-px text-mini">
            <slot />
          </div>
        </div>
        <div
          v-if="$slots.footer"
          class="px-2 pt-1 pb-1.5 border-t border-current/15 flex items-center justify-between gap-2 text-mini opacity-70"
        >
          <slot name="footer" />
        </div>
      </div>
    </motion.div>
  </AnimatePresence>
</template>
