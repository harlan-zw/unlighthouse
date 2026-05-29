<script lang="ts" setup>
import type { MotionValue } from 'motion-v'
import type { ChartBrushRange } from '../../composables/useChartBrush'

// Bundles the chart's hover tooltip + brush selection overlay into one tag.
// Card owns the wrap div + ref binding (the brush composable's `wrapRef`
// doesn't survive being passed through a child); this just consolidates the
// overlay calls + their prop wiring.
//
// Tooltip anchors to the cursor (spring-tracked) — see UiChartTooltip.

defineProps<{
  // --- brush state (useChartBrush) ---
  dragRange: ChartBrushRange | null
  selectionLeft: number
  selectionWidth: number
  // --- hover state (useChartHover) ---
  tooltipVisible: boolean
  cardSpring: MotionValue<number>
  cursorYSpring: MotionValue<number>
  placement?: 'above' | 'below'
  /** Label shown on the leading row of the tooltip (typically the hovered date). */
  hoverLabel: string
}>()
</script>

<template>
  <ClientOnly>
    <UiChartTooltip
      :x="cardSpring"
      :y="cursorYSpring"
      :visible="tooltipVisible"
      :placement="placement"
      :label="hoverLabel"
    >
      <template v-if="$slots['tooltip-header']" #header>
        <slot name="tooltip-header" />
      </template>
      <slot name="tooltip-rows" />
      <template v-if="$slots['tooltip-footer']" #footer>
        <slot name="tooltip-footer" />
      </template>
    </UiChartTooltip>

    <UiChartBrushOverlay
      :drag-range="dragRange"
      :selection-left="selectionLeft"
      :selection-width="selectionWidth"
    />
  </ClientOnly>
</template>
