<script lang="ts" setup>
import { VisAxis, VisCrosshair, VisLine, VisStackedBar, VisTooltip, VisXYContainer } from '@unovis/vue'

type CwvKey = 'lcp' | 'inp' | 'cls'

interface CruxHistoryEntry {
  value: number
  time: number
  good?: number
  ni?: number
  poor?: number
}

const {
  metric,
  data,
  loading = false,
  height = 140,
} = defineProps<{
  metric: CwvKey
  data: CruxHistoryEntry[]
  loading?: boolean
  height?: number
}>()

const CWV_THRESHOLDS: Record<CwvKey, { good: number, poor: number, format: (v: number) => string }> = {
  lcp: {
    good: 2500,
    poor: 4000,
    format: (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`,
  },
  inp: {
    good: 200,
    poor: 500,
    format: (ms: number) => `${Math.round(ms)}ms`,
  },
  cls: {
    good: 0.1,
    poor: 0.25,
    format: (v: number) => v.toFixed(2),
  },
}

const { good, poor, format: formatValue } = CWV_THRESHOLDS[metric]

function statusLabel(v: number): string {
  if (v <= good)
    return 'Good'
  if (v <= poor)
    return 'Needs Improvement'
  return 'Poor'
}

function statusColor(v: number): string {
  return thresholdHex(v, good, poor)
}

const combinedData = computed(() => {
  if (!data.some(e => e.value > 0))
    return []

  let lastP75: number | null = null
  let lastGood = 50
  let lastNi = 30
  let lastPoor = 20

  const result = data.map((e) => {
    const v = e.value
    const has = v > 0

    let gPct: number, nPct: number, pPct: number
    if (e.good != null && e.ni != null && e.poor != null) {
      gPct = e.good
      nPct = e.ni
      pPct = e.poor
    }
    else if (!has) {
      gPct = lastGood
      nPct = lastNi
      pPct = lastPoor
    }
    else {
      gPct = v <= good ? 80 : v <= poor ? 50 : 20
      pPct = v > poor ? 40 : v > good ? 15 : 5
      nPct = 100 - gPct - pPct
    }

    let p75: number | null = null
    if (has) {
      if (v <= good)
        p75 = (v / good) * gPct
      else if (v <= poor)
        p75 = gPct + ((v - good) / (poor - good)) * nPct
      else p75 = gPct + nPct + Math.min((v - poor) / poor, 1) * pPct
      lastP75 = p75
    }
    else {
      p75 = lastP75
    }

    if (has) { lastGood = gPct; lastNi = nPct; lastPoor = pPct }

    const g = Math.round(gPct)
    const n = Math.round(nPct)
    const p = 100 - g - n

    return {
      time: e.time,
      rawValue: v,
      has,
      g: has ? g : 0,
      n: has ? n : 0,
      p: has ? Math.max(p, 0) : 0,
      gm: !has ? g : 0,
      nm: !has ? n : 0,
      pm: !has ? Math.max(p, 0) : 0,
      p75,
      p75Dashed: !has ? p75 : undefined as number | undefined,
    }
  })

  for (let i = 0; i < result.length; i++) {
    if (!result[i].has && result[i].p75 != null) {
      if (i > 0 && result[i - 1].has)
        result[i - 1].p75Dashed = result[i - 1].p75!
      if (i < result.length - 1 && result[i + 1]?.has)
        result[i + 1].p75Dashed = result[i + 1].p75!
    }
  }

  return result
})

const margin = { left: 8, right: 8, top: 4, bottom: 36 }
const x = (_d: any, i: number) => i

const barAccessors = [
  (d: any) => d.g,
  (d: any) => d.n,
  (d: any) => d.p,
  (d: any) => d.gm,
  (d: any) => d.nm,
  (d: any) => d.pm,
]

function withAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const barColors = [
  withAlpha(semanticColors.success.hex, 0.75),
  withAlpha(semanticColors.warning.hex, 0.75),
  withAlpha(semanticColors.error.hex, 0.75),
  withAlpha(semanticColors.success.hex, 0.2),
  withAlpha(semanticColors.warning.hex, 0.2),
  withAlpha(semanticColors.error.hex, 0.2),
]

const yP75Solid = (d: any) => d.has ? d.p75 : undefined
const yP75Dashed = (d: any) => d.p75Dashed

const dateFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })

const tickValues = computed(() => {
  if (data.length < 3)
    return data.map((_, i) => i)
  const mid = Math.floor(data.length / 2)
  return [0, mid, data.length - 1]
})

function tickFormat(d: number) {
  const row = data[Math.round(d)]
  if (!row?.time)
    return ''
  return dateFormatter.format(new Date(row.time))
}

function tooltipTemplate(d: any) {
  if (!d)
    return ''
  const date = dateFormatter.format(new Date(d.time))
  if (!d.has) {
    return `<div style="padding:6px 10px;font-size:11px;color:var(--ui-text-muted)">
      <div style="margin-bottom:2px;font-weight:600;color:var(--ui-text)">${date}</div>
      No data collected this period
    </div>`
  }
  const color = statusColor(d.rawValue)
  return `<div style="padding:6px 10px;font-size:11px">
    <div style="margin-bottom:4px;font-weight:600;color:var(--ui-text)">${date}</div>
    <div style="display:flex;align-items:center;gap:6px">
      <span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0"></span>
      <span style="font-weight:600;color:${color}">${formatValue(d.rawValue)}</span>
      <span style="color:var(--ui-text-muted)">${statusLabel(d.rawValue)}</span>
    </div>
    <div style="margin-top:4px;color:var(--ui-text-dimmed);font-size:10px">
      Good ${d.g || 0}% · NI ${d.n || 0}% · Poor ${d.p || 0}%
    </div>
  </div>`
}

const chartKey = computed(() => `${metric}-${data.length}`)
</script>

<template>
  <div class="crux-chart" :style="{ height: `${height}px` }">
    <div v-if="loading" class="flex items-end gap-1 h-full pb-6 px-1">
      <USkeleton v-for="i in 16" :key="i" class="flex-1 h-full rounded-sm" />
    </div>

    <ClientOnly v-else-if="combinedData.length">
      <VisXYContainer
        :key="chartKey"
        :height="height"
        :data="combinedData"
        :margin="margin"
        :auto-margin="false"
        :y-domain="[0, 100]"
      >
        <VisStackedBar
          :x="x"
          :y="barAccessors"
          :color="barColors"
          :bar-padding="0.15"
          :rounded-corners="0"
        />
        <VisLine :x="x" :y="yP75Solid" :color="cwvMetricColors[metric].hex" :line-width="2" curve-type="monotoneX" />
        <VisLine :x="x" :y="yP75Dashed" :color="cwvMetricColors[metric].hex" :line-width="2" curve-type="monotoneX" :line-dash-array="[4, 3]" />
        <VisAxis
          type="x"
          :tick-line="false"
          :grid-line="false"
          :domain-line="false"
          :tick-values="tickValues"
          :tick-format="tickFormat"
          tick-text-font-size="11px"
          tick-text-color="var(--ui-text-dimmed)"
        />
        <VisTooltip :template="tooltipTemplate" />
        <VisCrosshair :template="() => ''" color="none" />
      </VisXYContainer>

      <template #fallback>
        <div class="flex items-end gap-1 h-full pb-6 px-1">
          <USkeleton v-for="i in 16" :key="i" class="flex-1 h-full rounded-sm" />
        </div>
      </template>
    </ClientOnly>

    <div v-else class="flex flex-col items-center justify-center h-full gap-1.5 border border-dashed border-default rounded-md">
      <UIcon name="i-lucide-line-chart" class="size-4 text-dimmed" />
      <p class="text-[11px] text-dimmed">
        Awaiting field data
      </p>
    </div>
  </div>
</template>

<style scoped>
.crux-chart {
  position: relative;
}

.crux-chart :deep(.unovis-stacked-bar-group rect:last-child) {
  rx: 2px;
}

.crux-chart :deep(.unovis-tooltip) {
  background: var(--ui-bg-elevated) !important;
  border: 1px solid var(--ui-border) !important;
  border-radius: 8px !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3) !important;
  padding: 0 !important;
}
</style>
