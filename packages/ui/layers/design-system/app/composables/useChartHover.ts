import type { MotionValue } from 'motion-v'
import type { Ref } from 'vue'
import { useMotionValue, useSpring } from 'motion-v'
import { onScopeDispose, shallowRef } from 'vue'

// Hover/tooltip half of a time-series chart's pointer UX. Sibling to
// useChartBrush — both cards (Gsc, Analytics) had near-identical tooltip
// state + spring-tracked card positioning. Pass in the brush's `isDragging`
// to suppress the tooltip during a drag (the selection overlay owns the
// visual then).
//
// Positioning model: the tooltip anchors to the *cursor* (not the chart edge)
// via spring-tracked `cardX` + `cursorY`. The `placement` ref says whether
// the tooltip sits above or below the cursor; consumers translate the
// rendered element accordingly. Above-cursor is the default; flips to below
// when the cursor is too close to the chart's top edge to fit the tooltip.

export interface UseChartHoverOptions {
  /** Chart wrapper element — used for BCR reads. */
  wrapRef: Ref<HTMLElement | null>
  /** Reactive chart width in px — usually from useChartBrush. */
  chartWidth: Ref<number>
  /** When true, onTooltip clears state instead of setting it. */
  isDragging?: Ref<boolean>
  /** Tooltip card width in px (used to keep the card on-screen). */
  tooltipWidth?: number
  /** Approximate tooltip height — used to decide when to flip above ↔ below. */
  tooltipHeightEst?: number
  /** Padding from the chart edges in px. */
  edgePad?: number
  /** Vertical gap between cursor and tooltip edge. */
  cursorGap?: number
  /** Spring config for the floating card (softer — glides). */
  cardSpring?: { stiffness: number, damping: number, mass: number }
}

export interface UseChartHover<T, E = void> {
  tooltipData: Ref<T | null>
  tooltipPrev: Ref<T | null>
  tooltipExtra: Ref<E | null>
  /** Spring-tracked cursor x (centre of tooltip). */
  cardSpring: MotionValue<number>
  /** Spring-tracked cursor y (anchor point of tooltip). */
  cursorYSpring: MotionValue<number>
  /** Which side of the cursor the tooltip sits on. Reactive. */
  placement: Ref<'above' | 'below'>
  onTooltip: (data: T | null, prev: T | null, extra?: E) => void
  onChartMove: (e: MouseEvent) => void
  clear: () => void
}

const DEFAULT_SPRING = { stiffness: 380, damping: 38, mass: 0.5 }

export function useChartHover<T, E = void>(opts: UseChartHoverOptions): UseChartHover<T, E> {
  const tooltipWidth = opts.tooltipWidth ?? 220
  const tooltipHeightEst = opts.tooltipHeightEst ?? 56
  const edgePad = opts.edgePad ?? 8
  const cursorGap = opts.cursorGap ?? 14
  // Approx axis row height; tooltip avoids sitting on top of axis tick labels.
  const AXIS_ROW = 36

  // shallowRef: these hold whole datum objects swapped wholesale on hover —
  // deep reactivity would be wasted tracking on every pointer move.
  const tooltipData = shallowRef<T | null>(null)
  const tooltipPrev = shallowRef<T | null>(null)
  const tooltipExtra = shallowRef<E | null>(null)

  function clear() {
    tooltipData.value = null
    tooltipPrev.value = null
    tooltipExtra.value = null
  }

  function onTooltip(data: T | null, prev: T | null, extra?: E) {
    if (opts.isDragging?.value) {
      clear()
      return
    }
    tooltipData.value = data
    tooltipPrev.value = prev
    tooltipExtra.value = (extra ?? null) as E | null
  }

  const cardX = useMotionValue(0)
  const cursorY = useMotionValue(0)
  const cardSpring = useSpring(cardX, opts.cardSpring ?? DEFAULT_SPRING)
  const cursorYSpring = useSpring(cursorY, opts.cardSpring ?? DEFAULT_SPRING)
  // Default 'above' (tooltip floats above cursor). Flips to 'below' when the
  // cursor is too close to the top edge to fit the tooltip without clipping.
  const placement = ref<'above' | 'below'>('above')

  // rAF-batch the mousemove handler so we do at most one motion update per frame.
  let rafId: number | null = null
  let pendingClientX = 0
  let pendingClientY = 0
  function onChartMove(e: MouseEvent) {
    pendingClientX = e.clientX
    pendingClientY = e.clientY
    if (rafId != null)
      return
    rafId = requestAnimationFrame(() => {
      rafId = null
      const width = opts.chartWidth.value
      if (width <= 0)
        return
      const rect = opts.wrapRef.value?.getBoundingClientRect()
      const cursorXpx = pendingClientX - (rect?.left ?? 0)
      const cursorYpx = pendingClientY - (rect?.top ?? 0)
      // Clamp x so the tooltip's left/right edges stay within the chart.
      const halfW = tooltipWidth / 2
      const clampedX = Math.max(halfW + edgePad, Math.min(width - halfW - edgePad, cursorXpx))
      cardX.set(clampedX)
      cursorY.set(cursorYpx)

      // Decide placement. Prefer above (tooltip floats over the data). Flip
      // to below when too close to the top edge to fit the full tooltip.
      // Also flip back to above when cursor would push the tooltip into the
      // axis-tick row at the bottom.
      const height = rect?.height ?? 0
      const fitsAbove = cursorYpx - cursorGap - tooltipHeightEst >= edgePad
      const fitsBelow = cursorYpx + cursorGap + tooltipHeightEst <= height - AXIS_ROW
      if (placement.value === 'above' && !fitsAbove && fitsBelow)
        placement.value = 'below'
      else if (placement.value === 'below' && fitsAbove && !fitsBelow)
        placement.value = 'above'
      else if (placement.value === 'below' && fitsAbove)
        placement.value = 'above'
    })
  }

  // Cancel any frame still queued when the consuming component tears down, so
  // the callback never reads a stale `wrapRef` element after unmount.
  onScopeDispose(() => {
    if (rafId != null)
      cancelAnimationFrame(rafId)
  })

  return {
    tooltipData,
    tooltipPrev,
    tooltipExtra,
    cardSpring,
    cursorYSpring,
    placement,
    onTooltip,
    onChartMove,
    clear,
  }
}
