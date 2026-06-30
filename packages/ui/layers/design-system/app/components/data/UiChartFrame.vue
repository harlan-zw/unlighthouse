<script lang="ts" setup>
import type { MotionValue } from 'motion-v'
import type { ChartBrushRange } from '../../composables/useChartBrush'
import type { ChartAnnotation } from '../../utils/chartAnnotations'
import { computed } from 'vue'
import { ANNOTATION_TONE_CLASS, annotationsOnDay } from '../../utils/chartAnnotations'

// Bundles the chart's hover tooltip + brush selection overlay into one tag, and
// (opt-in) the annotation marker overlay + same-day annotations inside the
// tooltip. Card owns the wrap div + ref binding (the brush composable's `wrapRef`
// doesn't survive being passed through a child); this just consolidates the
// overlay calls + their prop wiring.
//
// Tooltip anchors to the cursor (spring-tracked) — see UiChartTooltip. Markers
// render via UiChartAnnotations (shared with non-frame charts); both require the
// host wrap to be `position: relative` with zero horizontal margin (wrap width
// == plot x-span) so the CSS left-percentage maps to the right screen position.

const props = defineProps<{
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
  /**
   * Optional event annotations rendered as thin vertical marker lines + a dot at
   * the bottom of the plot area. Default [] — no change to existing charts (opt-in).
   * Requires `xDomain` to resolve pixel positions. When `xDomain` is absent,
   * annotations are silently skipped.
   */
  annotations?: ChartAnnotation[]
  /**
   * The visible x range [min, max] of the chart. Pass Date objects, ISO strings,
   * or epoch-ms numbers. Used to convert each annotation's `x` value to a CSS
   * left-percentage. Required when `annotations` are provided.
   */
  xDomain?: [Date | string | number, Date | string | number]
  /**
   * The currently-hovered x value (the day the crosshair is on). When it lands on
   * a day that carries annotations, those annotations are surfaced inside the
   * hover tooltip (a tone dot + label) so the marker isn't a hover-only native
   * title. Pass the hovered datum's date; omit to keep annotations marker-only.
   */
  hoverX?: Date | string | number | null
}>()

/** Annotations on the hovered day — surfaced inside the tooltip (dot + label). */
const tooltipAnnotations = computed(() =>
  annotationsOnDay(props.annotations ?? [], props.hoverX).map((ann, id) => ({
    id,
    label: ann.label,
    toneClass: ANNOTATION_TONE_CLASS[ann.tone ?? 'neutral'],
  })),
)
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
      <!-- Annotations on the hovered day: a tone dot + label, separated from the
           metric rows. Dot carries the semantic tone, label stays neutral text
           (color-budget: colored dot + neutral text). -->
      <div v-if="tooltipAnnotations.length" class="mt-1.5 pt-1.5 border-t border-default space-y-1">
        <div v-for="ann in tooltipAnnotations" :key="ann.id" class="flex items-center gap-1.5">
          <span :class="ann.toneClass" class="size-1.5 rounded-full shrink-0" aria-hidden="true" />
          <span class="text-xs text-muted truncate">{{ ann.label }}</span>
        </div>
      </div>
      <template v-if="$slots['tooltip-footer']" #footer>
        <slot name="tooltip-footer" />
      </template>
    </UiChartTooltip>

    <UiChartBrushOverlay
      :drag-range="dragRange"
      :selection-left="selectionLeft"
      :selection-width="selectionWidth"
    />

    <!-- Annotation markers (thin vertical lines + dots) — shared overlay. -->
    <UiChartAnnotations :annotations="annotations" :x-domain="xDomain" />
  </ClientOnly>
</template>
