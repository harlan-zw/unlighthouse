<script setup lang="ts">
import { useElementSize } from '@vueuse/core'

// A dependency-free multi-line trend chart. All series share one y-scale, so
// use it for like-scaled data (e.g. the four 0–100 category scores in one
// chart) and render separate instances for unlike scales (LCP vs CLS).
// Measured in real pixels via useElementSize so axis text stays crisp (a
// viewBox-scaled SVG would distort labels horizontally).

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
}>(), {
  height: 200,
  showLegend: true,
})

const fmt = (v: number) => (props.format ? props.format(v) : String(Math.round(v)))

const wrap = ref<HTMLElement | null>(null)
const { width } = useElementSize(wrap)

const PAD = { top: 10, right: 10, bottom: 22, left: 40 }

const allPoints = computed(() => props.series.flatMap(s => s.points))
const valid = computed(() => allPoints.value.filter(p => p.v != null) as Array<Required<TrendPoint>>)

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

function dotsFor(s: TrendSeries): Array<{ x: number, y: number, title: string }> {
  return s.points
    .filter(p => p.v != null)
    .map(p => ({
      x: xFor(p.t),
      y: yFor(p.v as number),
      title: `${s.label}: ${p.label ?? fmt(p.v as number)} — ${new Date(p.t).toLocaleDateString()}`,
    }))
}

// 4 horizontal gridlines / y labels.
const yTicks = computed(() => {
  const n = 4
  const out: Array<{ y: number, label: string }> = []
  for (let i = 0; i <= n; i++) {
    const v = yLo.value + (yHi.value - yLo.value) * (i / n)
    out.push({ y: yFor(v), label: fmt(v) })
  }
  return out
})

const xLabels = computed(() => {
  if (!allPoints.value.length)
    return []
  const first = new Date(tMin.value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const last = new Date(tMax.value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return tMin.value === tMax.value ? [{ x: xFor(tMin.value), label: first }] : [{ x: PAD.left, label: first }, { x: width.value - PAD.right, label: last }]
})

const hasData = computed(() => valid.value.length > 0)

const markerPositions = computed(() =>
  (props.markers ?? [])
    .filter(m => m.t >= tMin.value && m.t <= tMax.value)
    .map(m => ({ x: xFor(m.t), label: m.label, title: m.title ?? m.label })),
)
</script>

<template>
  <div>
    <div v-if="showLegend" class="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
      <div v-for="s in series" :key="s.label" class="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: s.color }" />
        {{ s.label }}
      </div>
    </div>
    <div ref="wrap" class="w-full relative">
      <!-- release marker pills, overlaid in HTML for crisp text -->
      <div
        v-for="(m, i) in markerPositions"
        :key="`mp${i}`"
        class="absolute top-0 -translate-x-1/2 z-10"
        :style="{ left: `${m.x}px` }"
      >
        <span :title="m.title" class="inline-block rounded bg-primary px-1 py-0.5 text-[9px] font-mono leading-none text-primary-foreground whitespace-nowrap">
          {{ m.label }}
        </span>
      </div>
      <svg v-if="width > 0 && hasData" :width="width" :height="height" class="overflow-visible">
        <!-- y gridlines + labels -->
        <g>
          <line
            v-for="(tick, i) in yTicks"
            :key="`g${i}`"
            :x1="PAD.left"
            :x2="width - PAD.right"
            :y1="tick.y"
            :y2="tick.y"
            class="stroke-border"
            stroke-width="1"
          />
          <text
            v-for="(tick, i) in yTicks"
            :key="`yl${i}`"
            :x="PAD.left - 6"
            :y="tick.y + 3"
            text-anchor="end"
            class="fill-muted-foreground text-[10px] tabular-nums"
          >{{ tick.label }}</text>
        </g>

        <!-- release markers (vertical guides) -->
        <line
          v-for="(m, i) in markerPositions"
          :key="`m${i}`"
          :x1="m.x"
          :x2="m.x"
          :y1="PAD.top"
          :y2="height - PAD.bottom"
          class="stroke-primary/40"
          stroke-width="1"
          stroke-dasharray="3 3"
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
          >
            <title>{{ dot.title }}</title>
          </circle>
        </g>

        <!-- x labels -->
        <text
          v-for="(xl, i) in xLabels"
          :key="`xl${i}`"
          :x="xl.x"
          :y="height - 6"
          :text-anchor="i === 0 && xLabels.length > 1 ? 'start' : (i === xLabels.length - 1 && xLabels.length > 1 ? 'end' : 'middle')"
          class="fill-muted-foreground text-[10px]"
        >{{ xl.label }}</text>
      </svg>
      <div v-else-if="width > 0" class="flex items-center justify-center text-xs text-muted-foreground" :style="{ height: `${height}px` }">
        No trend data yet.
      </div>
    </div>
  </div>
</template>
