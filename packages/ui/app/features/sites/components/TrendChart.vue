<script setup lang="ts">
import { useElementSize } from '@vueuse/core'

// A dependency-free multi-line trend chart. All series share one y-scale, so
// use it for like-scaled data (e.g. the four 0–100 category scores in one
// chart) and render separate instances for unlike scales (LCP vs CLS).
// Measured in real pixels via useElementSize so axis text stays crisp (a
// viewBox-scaled SVG would distort labels horizontally).
//
// D-051: re-platformed onto the DS chart-frame stack — UiChartFrame owns the
// hover tooltip + annotation-marker overlay, useChartHover owns the
// spring-tracked cursor position, useChartTickPlan owns x-axis tick
// selection/formatting. The multi-series polylines, y-gridlines and hover
// crosshair stay hand-drawn SVG (UiSparkline is single-series; the frame
// doesn't draw a plot itself, only its overlays) — see DESIGN.md D-051.

export interface TrendPoint {
  t: number // timestamp (ms)
  v: number | null // value; null = gap (not plotted)
  label?: string // optional tooltip override
}
export interface TrendSeries {
  label: string
  color: string
  points: TrendPoint[]
}
export interface TrendMarker {
  t: number // timestamp (ms) to place the marker at
  label: string // short pill text (e.g. commit hash)
  title?: string // hover tooltip
}

const props = withDefaults(defineProps<{
  series: TrendSeries[]
  height?: number
  yMin?: number
  yMax?: number
  format?: (v: number) => string
  showLegend?: boolean
  markers?: TrendMarker[]
  /** Accessible caption for the non-visual data table. */
  label?: string
  /**
   * @deprecated no longer changes rendering — release/CI markers now always
   * render through UiChartAnnotations (thin line + hover dot), replacing the
   * old always-visible pill. Kept so existing call sites don't need to change.
   */
  markerPills?: boolean
}>(), {
  height: 200,
  showLegend: true,
  markerPills: true,
  label: 'Trend data',
})

const fmt = (v: number) => (props.format ? props.format(v) : String(Math.round(v)))
const { fmtTimestamp } = createFormatters()

const wrap = ref<HTMLElement | null>(null)
const { width } = useElementSize(wrap)

const PAD = { top: 10, right: 10, bottom: 22, left: 40 }

const allPoints = computed(() => props.series.flatMap(s => s.points))
const valid = computed(() => allPoints.value.filter((p): p is TrendPoint & { v: number } => p.v != null))

const tMin = computed(() => Math.min(...allPoints.value.map(p => p.t)))
const tMax = computed(() => Math.max(...allPoints.value.map(p => p.t)))

const yLo = computed(() => {
  if (props.yMin != null)
    return props.yMin
  const vs = valid.value.map(p => p.v)
  return vs.length ? Math.min(...vs) : 0
})
const yHi = computed(() => {
  if (props.yMax != null)
    return props.yMax
  const vs = valid.value.map(p => p.v)
  if (!vs.length)
    return 1
  const max = Math.max(...vs)
  // pad the top 10% so the peak line isn't glued to the frame
  return max === yLo.value ? max + 1 : max + (max - yLo.value) * 0.1
})

const innerW = computed(() => Math.max(0, width.value - PAD.left - PAD.right))
const innerH = computed(() => Math.max(0, props.height - PAD.top - PAD.bottom))

function xFor(t: number): number {
  if (tMax.value === tMin.value)
    return PAD.left + innerW.value / 2
  return PAD.left + ((t - tMin.value) / (tMax.value - tMin.value)) * innerW.value
}
function yFor(v: number): number {
  if (yHi.value === yLo.value)
    return PAD.top + innerH.value / 2
  return PAD.top + (1 - (v - yLo.value) / (yHi.value - yLo.value)) * innerH.value
}

// Build an SVG path, lifting the pen across null gaps.
function pathFor(s: TrendSeries): string {
  let d = ''
  let pen = false
  for (const p of [...s.points].sort((a, b) => a.t - b.t)) {
    if (p.v == null) {
      pen = false
      continue
    }
    const cmd = pen ? 'L' : 'M'
    d += `${cmd}${xFor(p.t).toFixed(1)},${yFor(p.v).toFixed(1)} `
    pen = true
  }
  return d.trim()
}

function dotsFor(s: TrendSeries): Array<{ x: number, y: number }> {
  return s.points
    .filter(p => p.v != null)
    .map(p => ({
      x: xFor(p.t),
      y: yFor(p.v as number),
    }))
}

// 4 horizontal gridlines / y labels. Y-axis stays hand-rolled — the DS tick
// helpers are x-axis (calendar) only.
const yTicks = computed(() => {
  const n = 4
  const out: Array<{ y: number, label: string }> = []
  for (let i = 0; i <= n; i++) {
    const v = yLo.value + (yHi.value - yLo.value) * (i / n)
    out.push({ y: yFor(v), label: fmt(v) })
  }
  return out
})

const hasData = computed(() => valid.value.length > 0)

// ── x-axis ticks (useChartTickPlan) ────────────────────────────────────────
// Distinct timestamps that carry at least one value, sorted — the columns the
// hover crosshair snaps to and the domain the tick plan is built over.
const columns = computed(() => {
  const ts = new Set<number>()
  for (const s of props.series) {
    for (const p of s.points) {
      if (p.v != null)
        ts.add(p.t)
    }
  }
  return [...ts].sort((a, b) => a - b)
})

// Positions stay time-proportional (xFor), not index-evenly-spaced — scan
// timestamps are irregular, so index spacing would misrepresent the gaps.
// useChartTickPlan only picks WHICH columns get a label + how to format them.
const { tickPlan, firstTickYear } = useChartTickPlan({
  dates: () => columns.value.map(t => new Date(t).toISOString()),
})
const xTicks = computed(() => {
  const cols = columns.value
  const indices = tickPlan.value.indices
  return indices
    .map((idx, i) => {
      const t = cols[idx]
      if (t == null)
        return null
      return {
        x: xFor(t),
        label: tickPlan.value.format(new Date(t), i, firstTickYear.value),
        anchor: i === 0 ? 'start' as const : i === indices.length - 1 ? 'end' as const : 'middle' as const,
      }
    })
    .filter((t): t is { x: number, label: string, anchor: 'start' | 'end' | 'middle' } => t != null)
})

// ── Annotations (release/CI markers) — UiChartAnnotations/ChartAnnotation ──
const annotations = computed<ChartAnnotation[]>(() =>
  (props.markers ?? []).map(m => ({ x: m.t, label: m.title ?? m.label, tone: 'neutral' as const })),
)
const xDomain = computed<[number, number]>(() => hasData.value ? [tMin.value, tMax.value] : [0, 1])

// ── Hover crosshair + tooltip (useChartHover) ──────────────────────────────
interface HoverDatum {
  t: number
  dateLabel: string
  points: Array<{ label: string, color: string, text: string, y: number }>
}

const {
  tooltipData,
  cardSpring,
  cursorYSpring,
  placement,
  onTooltip,
  onChartMove,
  clear,
} = useChartHover<HoverDatum>({ wrapRef: wrap, chartWidth: width })

const tooltipVisible = computed(() => tooltipData.value != null)
const hoverPoints = computed(() => tooltipData.value?.points ?? [])
const hoverDate = computed(() => tooltipData.value?.dateLabel ?? '')
const hoverT = computed(() => tooltipData.value?.t ?? null)
const hoverX = computed(() => (hoverT.value == null ? null : xFor(hoverT.value)))

function onMove(e: PointerEvent) {
  if (!wrap.value || !columns.value.length)
    return
  onChartMove(e, ({ cursorX }) => {
    let best = columns.value[0]!
    let bd = Infinity
    for (const t of columns.value) {
      const d = Math.abs(xFor(t) - cursorX)
      if (d < bd) {
        bd = d
        best = t
      }
    }
    const points = props.series
      .map((s) => {
        const p = s.points.find(pp => pp.t === best && pp.v != null)
        return p ? { label: s.label, color: s.color, text: fmt(p.v as number), y: yFor(p.v as number) } : null
      })
      .filter((x): x is { label: string, color: string, text: string, y: number } => !!x)
    onTooltip({ t: best, dateLabel: fmtTimestamp(best, 'short'), points }, null)
  })
}
function onLeave() {
  clear()
}

function tableValue(s: TrendSeries, t: number): string {
  const point = s.points.find(candidate => candidate.t === t && candidate.v != null)
  if (!point || point.v == null)
    return 'No data'
  return point.label ?? fmt(point.v)
}
</script>

<template>
  <div>
    <div v-if="showLegend" class="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
      <div v-for="s in series" :key="s.label" class="flex items-center gap-1.5 text-xs text-muted">
        <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: s.color }" aria-hidden="true" />
        {{ s.label }}
      </div>
    </div>
    <div ref="wrap" class="w-full relative" @pointermove="onMove" @pointerleave="onLeave">
      <svg v-if="width > 0 && hasData" :width="width" :height="height" class="overflow-visible" aria-hidden="true" focusable="false">
        <!-- y gridlines + labels -->
        <g>
          <line
            v-for="(tick, i) in yTicks"
            :key="`g${i}`"
            :x1="PAD.left"
            :x2="width - PAD.right"
            :y1="tick.y"
            :y2="tick.y"
            class="stroke-[var(--ui-border)]"
            stroke-width="1"
          />
          <text
            v-for="(tick, i) in yTicks"
            :key="`yl${i}`"
            :x="PAD.left - 6"
            :y="tick.y + 3"
            text-anchor="end"
            class="fill-[var(--ui-text-muted)] text-[10px] tabular-nums"
          >{{ tick.label }}</text>
        </g>

        <!-- hover crosshair -->
        <line
          v-if="hoverX != null"
          :x1="hoverX"
          :x2="hoverX"
          :y1="PAD.top"
          :y2="height - PAD.bottom"
          class="stroke-[var(--ui-text-muted)]/40"
          stroke-width="1"
        />
        <circle
          v-for="(hp, i) in hoverPoints"
          :key="`hp${i}`"
          :cx="hoverX!"
          :cy="hp.y"
          r="4"
          fill="var(--ui-bg)"
          :stroke="hp.color"
          stroke-width="2"
        />

        <!-- series -->
        <g v-for="s in series" :key="s.label">
          <path :d="pathFor(s)" fill="none" :stroke="s.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          <circle
            v-for="(dot, i) in dotsFor(s)"
            :key="i"
            :cx="dot.x"
            :cy="dot.y"
            r="2.5"
            :fill="s.color"
          />
        </g>

        <!-- x labels — DS useChartTickPlan (calendar-aware cadence + format) -->
        <text
          v-for="(xt, i) in xTicks"
          :key="`xl${i}`"
          :x="xt.x"
          :y="height - 6"
          :text-anchor="xt.anchor"
          class="fill-[var(--ui-text-muted)] text-[10px]"
        >{{ xt.label }}</text>
      </svg>
      <div v-else-if="width > 0" class="flex items-center justify-center text-xs text-muted" :style="{ height: `${height}px` }">
        Run another scan to draw the trend.
      </div>

      <UiChartFrame
        :drag-range="null"
        :selection-left="0"
        :selection-width="0"
        :tooltip-visible="tooltipVisible"
        :card-spring="cardSpring"
        :cursor-y-spring="cursorYSpring"
        :placement="placement"
        :hover-label="hoverDate"
        :annotations="annotations"
        :x-domain="xDomain"
        :hover-x="hoverT"
      >
        <template #tooltip-rows>
          <div v-for="row in hoverPoints" :key="row.label" class="flex items-center gap-1.5 whitespace-nowrap">
            <span class="size-2 rounded-full shrink-0" :style="{ backgroundColor: row.color }" />
            <span class="text-muted">{{ row.label }}</span>
            <span class="ml-auto pl-3 font-semibold tabular-nums">{{ row.text }}</span>
          </div>
        </template>
      </UiChartFrame>
    </div>
    <table v-if="hasData" class="sr-only">
      <caption>{{ label }}</caption>
      <thead>
        <tr>
          <th scope="col">
            Series
          </th>
          <th v-for="t in columns" :key="t" scope="col">
            {{ fmtTimestamp(t, 'short') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in series" :key="s.label">
          <th scope="row">
            {{ s.label }}
          </th>
          <td v-for="t in columns" :key="t">
            {{ tableValue(s, t) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
