import type { MaybeRefOrGetter, Ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { computed, onUnmounted, ref, toValue } from 'vue'

// Provider-agnostic drag-to-select-range interaction for time-series charts.
// Extracted from ProCardGsc's pointer-drag logic (the brush half — hover/tooltip
// springs stay with the consuming card) so the Web Analytics chart reuses the
// same scrubbing UX without copying ~120 lines. The consumer binds `wrapRef` to
// the chart wrapper, draws the selection rect from `selectionLeft`/`selectionWidth`,
// and gets a committed `{ startIdx, endIdx, startDate, endDate }` via `onCommit`.

export interface ChartBrushRange {
  startIdx: number
  endIdx: number
  startDate: string
  endDate: string
}

export interface UseChartBrushOptions {
  /** Reactive ISO date strings, one per data point — drives idx ↔ date lookups. */
  dates: MaybeRefOrGetter<string[]>
  /** Called when a drag completes spanning more than one point. */
  onCommit: (range: ChartBrushRange) => void
}

export interface UseChartBrush {
  wrapRef: Ref<HTMLElement | null>
  chartWidth: Ref<number>
  isDragging: Ref<boolean>
  dragRange: Ref<ChartBrushRange | null>
  selectionLeft: Ref<number>
  selectionWidth: Ref<number>
  onPointerDown: (e: PointerEvent) => void
  refreshChartRect: () => void
  cancel: () => void
}

const DRAG_THRESHOLD_PX = 5

// Suppress page text-selection for the duration of a brush drag — a fast drag
// otherwise selects surrounding copy (the "disable text selection during drag"
// rule). Restored when the drag ends/cancels.
function setSelectSuppressed(on: boolean) {
  if (typeof document === 'undefined')
    return
  const s = document.documentElement.style
  s.setProperty('user-select', on ? 'none' : '')
  s.setProperty('-webkit-user-select', on ? 'none' : '')
}

export function useChartBrush(opts: UseChartBrushOptions): UseChartBrush {
  const wrapRef = ref<HTMLElement | null>(null)
  // Cached geometry — avoids synchronous layout reads on every pointermove.
  const chartWidth = ref(0)
  let chartRectLeft = 0

  const isDragging = ref(false)
  const dragRange = ref<ChartBrushRange | null>(null)

  useResizeObserver(wrapRef, ([entry]) => {
    if (!entry)
      return
    // Width comes straight off contentRect (no layout read). `chartRectLeft` is
    // refreshed via getBoundingClientRect() on pointerdown (refreshChartRect),
    // so reading it here too would just be a redundant synchronous reflow.
    chartWidth.value = entry.contentRect.width
  })

  function refreshChartRect() {
    const el = wrapRef.value
    if (!el)
      return
    const rect = el.getBoundingClientRect()
    chartRectLeft = rect.left
    chartWidth.value = rect.width
  }

  function pixelToIdx(px: number): number {
    const len = toValue(opts.dates).length
    const width = chartWidth.value
    if (len < 2 || width <= 0)
      return 0
    return Math.max(0, Math.min(len - 1, Math.round((px / width) * (len - 1))))
  }

  function idxToPixel(idx: number): number {
    const len = toValue(opts.dates).length
    const width = chartWidth.value
    if (len < 2 || width <= 0)
      return 0
    return (idx / (len - 1)) * width
  }

  function idxToDate(idx: number): string {
    const rows = toValue(opts.dates)
    const clamped = Math.max(0, Math.min(rows.length - 1, idx))
    return rows[clamped] ?? ''
  }

  const selectionLeft = computed(() => dragRange.value ? idxToPixel(dragRange.value.startIdx) : 0)
  const selectionWidth = computed(() => {
    if (!dragRange.value)
      return 0
    return Math.max(0, idxToPixel(dragRange.value.endIdx) - idxToPixel(dragRange.value.startIdx))
  })

  let dragStartX = 0
  let dragStartIdx = 0
  let removeWindowListeners: (() => void) | null = null

  function cancel() {
    removeWindowListeners?.()
    removeWindowListeners = null
    isDragging.value = false
    dragRange.value = null
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0)
      return
    if (!wrapRef.value)
      return
    // Single BCR read on drag start — covers scroll/offset drift since last observer tick.
    refreshChartRect()
    dragStartX = e.clientX - chartRectLeft
    dragStartIdx = pixelToIdx(dragStartX)

    // rAF-coalesce moves: a fast drag fires pointermove many times per frame,
    // but we only need one reactive `dragRange` write (and one overlay render)
    // per frame. Listener is passive — we never preventDefault on move.
    let moveRaf: number | null = null
    let pendingX = 0
    const onMove = (ev: PointerEvent) => {
      pendingX = ev.clientX - chartRectLeft
      if (moveRaf != null)
        return
      moveRaf = requestAnimationFrame(() => {
        moveRaf = null
        const currentX = pendingX
        if (!isDragging.value) {
          if (Math.abs(currentX - dragStartX) < DRAG_THRESHOLD_PX)
            return
          isDragging.value = true
          setSelectSuppressed(true)
        }
        const currentIdx = pixelToIdx(currentX)
        const startIdx = Math.min(dragStartIdx, currentIdx)
        const endIdx = Math.max(dragStartIdx, currentIdx)
        dragRange.value = {
          startIdx,
          endIdx,
          startDate: idxToDate(startIdx),
          endDate: idxToDate(endIdx),
        }
      })
    }

    const onUp = () => {
      removeWindowListeners?.()
      removeWindowListeners = null
      const range = dragRange.value
      isDragging.value = false
      dragRange.value = null
      if (range && range.endIdx > range.startIdx)
        opts.onCommit(range)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { once: true })
    window.addEventListener('pointercancel', onUp, { once: true })
    removeWindowListeners = () => {
      if (moveRaf != null)
        cancelAnimationFrame(moveRaf)
      setSelectSuppressed(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }

  onUnmounted(() => removeWindowListeners?.())

  return {
    wrapRef,
    chartWidth,
    isDragging,
    dragRange,
    selectionLeft,
    selectionWidth,
    onPointerDown,
    refreshChartRect,
    cancel,
  }
}
