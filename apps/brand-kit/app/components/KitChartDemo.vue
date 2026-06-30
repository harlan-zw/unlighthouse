<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useChartBrush } from '#design-system/app/composables/useChartBrush'
import { useChartHover } from '#design-system/app/composables/useChartHover'
import { useChartTickPlan } from '#design-system/app/composables/useChartTickPlan'

// Brand-kit chart fixture. Renders a single SVG line chart wired to the three
// chart composables + UiChartFrame, parameterised so the same component can
// demonstrate every primitive permutation (single metric, multi metric, with
// comparison, with estimated badge, short / long periods).

interface DemoRow {
  date: string
  values: number[]
  prev?: number[] | null
}

interface MetricSpec {
  key: string
  label: string
  color: string
  gradientStop: string
}

const props = defineProps<{
  data: DemoRow[]
  metrics: MetricSpec[]
  /** Show the "Estimated" header badge in the tooltip. */
  estimated?: boolean
  /** Render prev-comparison footer + dashed prev line. */
  showComparison?: boolean
  /** Hide axis ticks (useful for tight previews). */
  hideAxis?: boolean
  /** Chart height in px. Default 220. */
  height?: number
  /** Show the bottom debug strip (pts / width / drag state). Off by default. */
  debug?: boolean
  /** Opt-in area fill under a single-metric line (Tufte-off by default: the line already encodes magnitude). */
  area?: boolean
}>()

const CHART_HEIGHT = computed(() => props.height ?? 220)

const dates = computed(() => props.data.map(d => d.date))

const {
  wrapRef,
  chartWidth,
  isDragging,
  dragRange,
  selectionLeft,
  selectionWidth,
  onPointerDown,
  refreshChartRect,
} = useChartBrush({
  dates,
  onCommit: (r) => { committedRange.value = r },
})

const {
  tooltipData,
  cardSpring,
  cursorYSpring,
  placement,
  onTooltip,
  onChartMove,
} = useChartHover<DemoRow>({ wrapRef, chartWidth, isDragging })

const { tickPlan, tickFormat } = useChartTickPlan({ dates })

const committedRange = ref<{ startDate: string, endDate: string } | null>(null)

const yExtent = computed(() => {
  let mx = 0
  let mn = Infinity
  for (const row of props.data) {
    for (const v of row.values) {
      mx = Math.max(mx, v)
      mn = Math.min(mn, v)
    }
    if (props.showComparison && row.prev) {
      for (const v of row.prev) {
        mx = Math.max(mx, v)
        mn = Math.min(mn, v)
      }
    }
  }
  if (!Number.isFinite(mn))
    mn = 0
  return { min: mn, max: Math.max(1, mx) }
})
const yMax = computed(() => yExtent.value.max * 1.05)

function pathFor(getter: (row: DemoRow) => number | null): string {
  const width = chartWidth.value
  if (!width || props.data.length < 2)
    return ''
  const stepX = width / (props.data.length - 1)
  const baseY = CHART_HEIGHT.value - 40
  const innerH = CHART_HEIGHT.value - 50
  let started = false
  let out = ''
  for (let i = 0; i < props.data.length; i++) {
    const row = props.data[i]
    if (!row) {
      started = false
      continue
    }
    const v = getter(row)
    if (v == null || Number.isNaN(v)) {
      started = false
      continue
    }
    const x = i * stepX
    const y = baseY - (v / yMax.value) * innerH
    out += `${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `
    started = true
  }
  return out.trim()
}

const linePaths = computed(() => props.metrics.map((m, mi) => ({
  ...m,
  line: pathFor(row => row.values[mi] ?? null),
  prev: props.showComparison
    ? pathFor(row => row.prev?.[mi] ?? null)
    : '',
})))

const areaPath = computed(() => {
  // Off by default. Area fill adds ink without adding information; the line
  // already encodes magnitude. Opt in via `area` for ambient ribbon use.
  if (!props.area || props.metrics.length !== 1 || !linePaths.value[0]?.line || !chartWidth.value)
    return ''
  const base = CHART_HEIGHT.value - 40
  return `${linePaths.value[0].line} L${chartWidth.value},${base} L0,${base} Z`
})

// Direct end-of-line labels (Tufte: prefer over a legend/tooltip-only decode).
// Each metric gets its label + last value pinned to the right of its line.
const endLabels = computed(() => {
  if (!chartWidth.value || props.data.length < 2)
    return []
  const last = props.data[props.data.length - 1]
  if (!last)
    return []
  const baseY = CHART_HEIGHT.value - 40
  const innerH = CHART_HEIGHT.value - 50
  return props.metrics.map((m, mi) => {
    const v = last.values[mi]
    if (v == null)
      return null
    const y = baseY - (v / yMax.value) * innerH
    return { key: m.key, label: m.label, color: m.color, y, value: v }
  }).filter((x): x is { key: string, label: string, color: string, y: number, value: number } => !!x)
})

// Range-frame: two tiny y labels (min/max) — Tufte's preferred minimal y-axis.
const rangeFrame = computed(() => {
  const baseY = CHART_HEIGHT.value - 40
  const innerH = CHART_HEIGHT.value - 50
  const { min, max } = yExtent.value
  return {
    max: { y: baseY - (max / yMax.value) * innerH, value: max },
    min: { y: baseY - (min / yMax.value) * innerH, value: min },
  }
})

const dateFmt = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' })
const hoverDate = computed(() => tooltipData.value ? dateFmt.format(new Date(`${tooltipData.value.date}T00:00:00`)) : '')
// Demo "prev" is a parallel series for the same range, shifted -1 year for the label.
const prevDate = computed(() => {
  const r = tooltipData.value
  if (!r?.prev)
    return ''
  const d = new Date(`${r.date}T00:00:00`)
  d.setFullYear(d.getFullYear() - 1)
  return dateFmt.format(d)
})

function onChartPointerOver(e: MouseEvent) {
  const width = chartWidth.value
  if (!width || props.data.length < 2)
    return
  const rect = wrapRef.value?.getBoundingClientRect()
  if (!rect)
    return
  const x = e.clientX - rect.left
  const stepX = width / (props.data.length - 1)
  const idx = Math.max(0, Math.min(props.data.length - 1, Math.round(x / stepX)))
  const row = props.data[idx] ?? null
  const prev = props.showComparison && idx > 0 ? (props.data[idx - 1] ?? null) : null
  onTooltip(row, prev)
}

function onChartPointerMove(e: MouseEvent) {
  onChartMove(e)
  onChartPointerOver(e)
}

function onChartLeave() {
  onTooltip(null, null)
}

function fmtVal(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US')
}
</script>

<template>
  <div class="space-y-2">
    <div
      ref="wrapRef"
      class="relative select-none touch-none w-full"
      :class="{ 'cursor-crosshair': !isDragging, 'cursor-ew-resize': isDragging }"
      :style="{ height: `${CHART_HEIGHT}px` }"
      @mousemove="onChartPointerMove"
      @mouseleave="onChartLeave"
      @pointerenter="refreshChartRect"
      @pointerdown="onPointerDown"
    >
      <svg
        v-if="chartWidth"
        :width="chartWidth"
        :height="CHART_HEIGHT"
        class="absolute inset-0 overflow-visible pointer-events-none"
      >
        <defs>
          <linearGradient :id="`kit-grad-${metrics[0]?.key}`" gradientTransform="rotate(90)">
            <stop offset="0%" :stop-color="metrics[0]?.gradientStop ?? 'rgba(59,130,246,0.25)'" />
            <stop offset="100%" stop-color="rgba(59,130,246,0.01)" />
          </linearGradient>
        </defs>
        <path :d="areaPath" :fill="`url(#kit-grad-${metrics[0]?.key})`" />
        <!-- Layering: first metric is primary (full weight), rest recede.
             Lets a multi-line chart read with a clear focal series. -->
        <template v-for="(m, mi) in linePaths" :key="m.key">
          <path
            v-if="m.prev"
            :d="m.prev"
            fill="none"
            :stroke="m.color"
            :stroke-width="mi === 0 ? 1.25 : 1"
            :stroke-opacity="mi === 0 ? 0.35 : 0.2"
            stroke-dasharray="6 4"
          />
          <path
            :d="m.line"
            fill="none"
            :stroke="m.color"
            :stroke-width="mi === 0 ? 2 : 1.25"
            :stroke-opacity="mi === 0 ? 1 : 0.7"
          />
        </template>
        <!-- Range-frame: min/max only (Tufte's two-tick y-axis). Anchored
             inside the plot at the left edge so the SVG's left clip doesn't
             eat the labels. -->
        <g v-if="!hideAxis" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">
          <text :x="2" :y="rangeFrame.max.y - 4" text-anchor="start" font-size="10" fill="var(--ui-text-dimmed)">{{ rangeFrame.max.value.toLocaleString('en-US') }}</text>
          <text :x="2" :y="rangeFrame.min.y - 4" text-anchor="start" font-size="10" fill="var(--ui-text-dimmed)">{{ rangeFrame.min.value.toLocaleString('en-US') }}</text>
        </g>
        <!-- Direct end-of-line labels: erase tooltip-only decoding. -->
        <g v-if="endLabels.length">
          <text
            v-for="lab in endLabels"
            :key="lab.key"
            :x="chartWidth + 6"
            :y="lab.y"
            dominant-baseline="middle"
            font-size="10"
            font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
            :fill="lab.color"
          >{{ lab.label }}</text>
        </g>
        <g v-if="!hideAxis && chartWidth">
          <text
            v-for="(idx, i) in tickPlan.indices"
            :key="idx"
            :x="(idx / (data.length - 1)) * chartWidth"
            :y="CHART_HEIGHT - 12"
            :text-anchor="i === 0 ? 'start' : (i === tickPlan.indices.length - 1 ? 'end' : 'middle')"
            font-size="11"
            fill="var(--ui-text-dimmed)"
          >
            {{ tickFormat(idx) }}
          </text>
        </g>
      </svg>

      <UiChartFrame
        :drag-range="dragRange"
        :selection-left="selectionLeft"
        :selection-width="selectionWidth"
        :tooltip-visible="!!tooltipData"
        :card-spring="cardSpring"
        :cursor-y-spring="cursorYSpring"
        :placement="placement"
        :hover-label="hoverDate"
      >
        <template v-if="estimated" #tooltip-header>
          <span class="text-[9px] uppercase tracking-wider font-medium text-warning">Estimated</span>
        </template>
        <template #tooltip-rows>
          <div
            v-for="(m, mi) in metrics"
            :key="m.key"
            class="items-center gap-2 py-0.5" :class="[
              metrics.length > 1 ? 'grid grid-cols-[auto_1fr_auto]' : 'grid grid-cols-[1fr_auto]',
            ]"
          >
            <span v-if="metrics.length > 1" class="size-1.5 rounded-full" :style="{ background: m.color }" />
            <span class="text-[11px] text-muted">{{ m.label }}</span>
            <span class="text-[13px] font-semibold tabular-nums justify-self-end">{{ fmtVal(tooltipData?.values[mi]) }}</span>
          </div>
        </template>
        <template v-if="showComparison && tooltipData?.prev" #tooltip-footer>
          <span class="text-[9px] uppercase tracking-wider text-dimmed">vs</span>
          <span class="text-[10px] text-muted tabular-nums">{{ prevDate }}</span>
        </template>
      </UiChartFrame>
    </div>

    <div v-if="debug" class="text-[10px] text-dimmed tabular-nums">
      {{ data.length }} pts · width: {{ chartWidth }}px · isDragging: {{ isDragging }} · anchor: {{ cardAnchor }} · committed: {{ committedRange ? `${committedRange.startDate} → ${committedRange.endDate}` : '—' }}
    </div>
  </div>
</template>
