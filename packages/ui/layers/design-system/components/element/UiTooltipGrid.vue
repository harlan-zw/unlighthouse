<script setup lang="ts" generic="T = unknown">
/**
 * UiTooltipGrid
 *
 * One shared tooltip + pointer-event delegation on a wrapper element.
 *
 * Use this for heatmaps / dense grids where mounting one TooltipRoot per cell
 * is wasteful (state churn, focus-ring conflicts, "safe-polygon" flicker
 * between adjacent triggers). Industry precedent: GitHub contribution graph,
 * Observable Plot, Recharts, Grafana panels — all use a single tooltip
 * element repositioned to whichever cell is under the cursor.
 *
 * Cells inside the slot must carry data attributes:
 *   data-tooltip-row="0"
 *   data-tooltip-col="3"
 *   data-tooltip-value="42"            (optional, forwarded to resolve())
 *
 * Positioning uses `position: fixed` + manual `getBoundingClientRect` math
 * with viewport clamping. No external deps; flips automatically on the
 * preferred side when there isn't room.
 */

interface ResolvedTooltip {
  title?: string
  /**
   * Detail rows. The first row becomes the hero value (oversized monospace
   * number + uppercase label). Remaining rows render as key/value pairs.
   */
  details?: { label: string, value?: string, color?: 'default' | 'muted' | 'success' | 'error' | 'warning' }[]
  /** Semantic level — drives the accent bar color and header dot. */
  level?: 'success' | 'warning' | 'error' | 'info' | 'neutral'
}

interface Props {
  /** Called per cell to compute tooltip content. Return null/undefined to hide. */
  resolve: (cell: { row: number, col: number, value: T, el: HTMLElement }) => ResolvedTooltip | null | undefined
  /** Selector identifying a cell inside the wrapper. */
  selector?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  /** Override max-width for the tooltip body. */
  maxWidth?: string
}

const props = withDefaults(defineProps<Props>(), {
  selector: '[data-tooltip-row]',
  side: 'top',
  sideOffset: 6,
  maxWidth: '250px',
})

const tooltipEl = useTemplateRef<HTMLElement>('tooltipEl')
const data = shallowRef<ResolvedTooltip | null>(null)
const open = ref(false)

// Hot-path state kept off Vue's reactivity system. Updating these on every
// pointermove does NOT trigger renders — we only flip Vue state when the
// resolved data (i.e. cell identity) actually changes.
let currentTarget: HTMLElement | null = null
let tipWidth = 0
let tipHeight = 0
let rafPending = false

function applyTransform(refRect: DOMRect) {
  if (!tooltipEl.value || !tipWidth || !tipHeight)
    return
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 8
  const offset = props.sideOffset
  const side = props.side

  let top = 0
  let left = 0
  if (side === 'top') {
    top = refRect.top - tipHeight - offset
    left = refRect.left + refRect.width / 2 - tipWidth / 2
  }
  else if (side === 'bottom') {
    top = refRect.bottom + offset
    left = refRect.left + refRect.width / 2 - tipWidth / 2
  }
  else if (side === 'left') {
    top = refRect.top + refRect.height / 2 - tipHeight / 2
    left = refRect.left - tipWidth - offset
  }
  else {
    top = refRect.top + refRect.height / 2 - tipHeight / 2
    left = refRect.right + offset
  }

  if (side === 'top' && top < pad)
    top = refRect.bottom + offset
  else if (side === 'bottom' && top + tipHeight > vh - pad)
    top = refRect.top - tipHeight - offset

  if (left < pad)
    left = pad
  if (left + tipWidth > vw - pad)
    left = vw - tipWidth - pad
  if (top < pad)
    top = pad
  if (top + tipHeight > vh - pad)
    top = vh - tipHeight - pad

  // Direct DOM write — bypasses Vue reactivity and uses GPU-composite-only transform.
  tooltipEl.value.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`
}

function measureTip() {
  if (!tooltipEl.value)
    return
  const r = tooltipEl.value.getBoundingClientRect()
  tipWidth = r.width
  tipHeight = r.height
}

function scheduleReposition() {
  if (rafPending)
    return
  rafPending = true
  requestAnimationFrame(() => {
    rafPending = false
    if (!currentTarget)
      return
    applyTransform(currentTarget.getBoundingClientRect())
  })
}

function activate(target: HTMLElement) {
  const row = Number(target.dataset.tooltipRow)
  const col = Number(target.dataset.tooltipCol)
  if (Number.isNaN(row) || Number.isNaN(col))
    return false
  const raw = target.dataset.tooltipValue
  let value: unknown
  if (raw === undefined) {
    value = undefined
  }
  else {
    const n = Number(raw)
    value = (Number.isFinite(n) && raw.trim() !== '') ? n : raw
  }
  const resolved = props.resolve({ row, col, value: value as T, el: target })
  if (!resolved)
    return false

  const wasOpen = open.value
  // Stamp active state on the new cell, clear it on the previous one.
  if (currentTarget && currentTarget !== target)
    currentTarget.removeAttribute('data-tooltip-active')
  target.setAttribute('data-tooltip-active', 'true')

  currentTarget = target
  data.value = resolved
  if (!wasOpen) {
    // Suppress the transform transition on the very first show so the
    // tooltip doesn't fly in from (0,0). We measure, place, then re-enable.
    tooltipEl.value?.setAttribute('data-first-show', 'true')
    open.value = true
  }

  // After content renders, measure once then place. For subsequent swaps
  // (same content shape, mostly) we can skip remeasure and just translate.
  nextTick(() => {
    if (!wasOpen)
      measureTip()
    if (currentTarget)
      applyTransform(currentTarget.getBoundingClientRect())
    if (!wasOpen) {
      // Re-enable transform transition on the next frame so subsequent
      // cell-to-cell swaps glide smoothly.
      requestAnimationFrame(() => {
        tooltipEl.value?.removeAttribute('data-first-show')
      })
    }
  })
  return true
}

function deactivate() {
  if (!open.value && !currentTarget)
    return
  open.value = false
  if (currentTarget)
    currentTarget.removeAttribute('data-tooltip-active')
  currentTarget = null
}

function handlePointerMove(e: PointerEvent) {
  const target = (e.target as HTMLElement | null)?.closest(props.selector) as HTMLElement | null
  if (!target) {
    deactivate()
    return
  }
  if (target === currentTarget)
    return
  if (!activate(target))
    deactivate()
}

function handlePointerLeave() {
  deactivate()
}

function handleFocusIn(e: FocusEvent) {
  const target = (e.target as HTMLElement | null)?.closest(props.selector) as HTMLElement | null
  if (!target)
    return
  activate(target)
}

function handleFocusOut() {
  deactivate()
}

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value)
    deactivate()
}

// Keep glued on scroll/resize while open. rAF-batched.
function onScrollOrResize() {
  if (currentTarget)
    scheduleReposition()
}

// When content swaps the body height may change — re-measure on next data tick.
watch(data, () => {
  if (!open.value)
    return
  nextTick(() => {
    measureTip()
    if (currentTarget)
      applyTransform(currentTarget.getBoundingClientRect())
  })
})

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
  window.addEventListener('resize', onScrollOrResize, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScrollOrResize, { capture: true })
  window.removeEventListener('resize', onScrollOrResize)
})
</script>

<template>
  <div
    class="contents"
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
    @focusin="handleFocusIn"
    @focusout="handleFocusOut"
    @keydown="handleKey"
  >
    <slot />
    <Teleport to="body">
      <div
        v-show="open && data"
        ref="tooltipEl"
        role="tooltip"
        class="ui-tooltip-grid-content"
        :data-open="open"
        :aria-hidden="!open"
      >
        <div
          v-if="data"
          class="text-left font-normal leading-normal flex items-stretch"
          :style="{ maxWidth }"
          :data-level="data.level || 'neutral'"
          data-ui="UiTooltipGrid"
        >
          <!-- Vertical accent bar — semantic-coded -->
          <span class="ui-tooltip-grid-accent" aria-hidden="true" />
          <div class="flex-1 min-w-0 pl-2.5">
            <!-- Header: status dot + uppercase title -->
            <div v-if="data.title" class="flex items-center gap-1.5 mb-1.5">
              <span class="ui-tooltip-grid-dot" aria-hidden="true" />
              <span class="text-[10px] uppercase tracking-wider font-medium text-dimmed">
                {{ data.title }}
              </span>
            </div>
            <template v-if="data.details?.length">
              <!-- Hero value: first detail row, oversized monospace -->
              <div class="flex items-baseline gap-1.5 mb-0.5">
                <span
                  class="font-mono tabular-nums font-semibold text-base leading-none"
                  :class="{
                    'text-success': data.details[0]!.color === 'success',
                    'text-error': data.details[0]!.color === 'error',
                    'text-warning': data.details[0]!.color === 'warning',
                  }"
                >{{ data.details[0]!.value ?? '—' }}</span>
                <span class="text-[10px] uppercase tracking-wider text-dimmed">{{ data.details[0]!.label }}</span>
              </div>
              <!-- Secondary rows: stacked key/value -->
              <div v-if="data.details.length > 1" class="mt-2 pt-2 border-t border-default space-y-0.5">
                <div
                  v-for="(d, i) in data.details.slice(1)"
                  :key="i"
                  class="flex items-center justify-between gap-4 text-[11px]"
                >
                  <span class="text-muted">{{ d.label }}</span>
                  <span
                    v-if="d.value"
                    class="font-mono tabular-nums"
                    :class="{
                      'text-success': d.color === 'success',
                      'text-error': d.color === 'error',
                      'text-warning': d.color === 'warning',
                      'text-muted': d.color === 'muted',
                      'text-default': !d.color || d.color === 'default',
                    }"
                  >{{ d.value }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
.ui-tooltip-grid-content {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  background-color: var(--ui-bg-elevated);
  background-image: linear-gradient(
    to bottom,
    rgb(255 255 255 / 0.025),
    rgb(0 0 0 / 0.015) 60%,
    rgb(0 0 0 / 0.03)
  );
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  pointer-events: none;
  /*
   * Matches UiTooltip chrome — see notes there. Inset highlights only,
   * no gradient surface (DESIGN.pro.md rule).
   */
  box-shadow:
    0 1px 1px 0 rgb(0 0 0 / 0.05),
    0 4px 12px -2px rgb(0 0 0 / 0.08),
    0 16px 32px -8px rgb(0 0 0 / 0.12),
    inset 0 1px 0 0 rgb(255 255 255 / 0.06),
    inset 0 -1px 0 0 rgb(0 0 0 / 0.04);
  letter-spacing: -0.005em;
  -webkit-font-smoothing: antialiased;
  will-change: transform, opacity;
  /* GPU-composite-only transition — no layout, no paint. */
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease-out;
  opacity: 0;
}

/* Suppress transform transition on the very first reveal so the tooltip
   doesn't fly in from (0,0). The opacity fade still plays. */
.ui-tooltip-grid-content[data-first-show="true"] {
  transition: opacity 120ms ease-out;
}

.ui-tooltip-grid-content[data-open="true"] {
  opacity: 1;
}

.dark .ui-tooltip-grid-content {
  background-image: linear-gradient(
    to bottom,
    rgb(255 255 255 / 0.04),
    rgb(255 255 255 / 0.015) 55%,
    rgb(0 0 0 / 0.04)
  );
}

/* ─── Body ─── */
.ui-tooltip-grid-accent {
  flex: 0 0 2px;
  align-self: stretch;
  border-radius: 999px;
  background: var(--accent, var(--ui-text));
  opacity: 0.55;
}

[data-ui="UiTooltipGrid"][data-level="success"] { --accent: var(--color-success-500); }
[data-ui="UiTooltipGrid"][data-level="warning"] { --accent: var(--color-warning-500); }
[data-ui="UiTooltipGrid"][data-level="error"]   { --accent: var(--color-error-500); }
[data-ui="UiTooltipGrid"][data-level="info"]    { --accent: var(--color-info-500); }
[data-ui="UiTooltipGrid"][data-level="neutral"] { --accent: var(--ui-text); }

.ui-tooltip-grid-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 999px;
  background: var(--accent, var(--ui-text));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, var(--ui-text)) 25%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .ui-tooltip-grid-content {
    transition: opacity 80ms linear;
  }
}

/* ─── Active cell state — applied to whichever cell is currently hovered ─── */
[data-tooltip-active="true"] {
  position: relative;
  z-index: 1;
  outline: 1.5px solid var(--ui-border-accented);
  outline-offset: 1px;
  transform: scale(1.08);
  transition: transform 120ms cubic-bezier(0.22, 1, 0.36, 1), outline-color 100ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  [data-tooltip-active="true"] {
    transform: none;
    transition: outline-color 100ms ease-out;
  }
}
</style>
