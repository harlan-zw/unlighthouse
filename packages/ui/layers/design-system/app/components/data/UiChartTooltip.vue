<script lang="ts" setup>
import type { MotionValue } from 'motion-v'
import { AnimatePresence, motion, useReducedMotion } from 'motion-v'
import { computed } from 'vue'

// Single floating readout for time-series chart hover. Anchored to the cursor
// position (spring-tracked x + y), sitting either above or below depending on
// available room. Uses the shared overlay chrome (`.ui-popover-content` +
// `bg-default`) so it reads as a solid raised card in both light/dark — the
// metric rows consumers pass in use the standard text tokens (text-muted /
// text-default / text-dimmed), which only stay legible on a non-inverted
// surface. No companion crosshair pill, no chart-edge pinning.
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

// Reduced motion: drop the scale pop + placement-translate easing; the tooltip
// fades only (sibling chart overlays gate the same way).
const reduced = useReducedMotion()
const enter = computed(() => (reduced.value ? { opacity: 1 } : { opacity: 1, scale: 1 }))
const initial = computed(() => (reduced.value ? { opacity: 0 } : { opacity: 0, scale: 0.96 }))
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-if="visible"
      key="chart-tooltip"
      :initial="initial"
      :animate="enter"
      :exit="initial"
      :transition="{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }"
      :style="{ x, y }"
      class="absolute top-0 left-0 z-10 pointer-events-none"
    >
      <div
        class="ui-popover-content min-w-[120px] max-w-[280px] rounded-md bg-default text-default ring ring-default -translate-x-1/2 transition-transform duration-150 ease-out motion-reduce:transition-none" :class="[
          (placement ?? 'above') === 'above' ? '-translate-y-full -mt-3' : 'mt-3',
        ]"
      >
        <div
          v-if="$slots.header"
          class="px-2 pt-1.5 pb-1 border-b border-muted flex items-center gap-2"
        >
          <slot name="header" />
        </div>
        <div class="px-2 py-1 flex items-center gap-2 whitespace-nowrap">
          <span class="text-mini font-medium tabular-nums text-muted">{{ label }}</span>
          <div v-if="$slots.default" class="h-3 w-px bg-[var(--ui-border)]" />
          <div class="flex-1 flex flex-col gap-px text-mini">
            <slot />
          </div>
        </div>
        <div
          v-if="$slots.footer"
          class="px-2 pt-1 pb-1.5 border-t border-muted flex items-center justify-between gap-2 text-mini"
        >
          <slot name="footer" />
        </div>
      </div>
    </motion.div>
  </AnimatePresence>
</template>
