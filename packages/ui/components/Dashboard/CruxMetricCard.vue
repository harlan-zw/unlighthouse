<script lang="ts" setup>
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
  history,
  loading = false,
} = defineProps<{
  metric: CwvKey
  history: CruxHistoryEntry[]
  loading?: boolean
}>()

const CWV_CONFIG: Record<CwvKey, {
  name: string
  description: string
  good: number
  poor: number
  format: (v: number) => string
  thresholdLabels: { good: string, ni: string, poor: string }
}> = {
  lcp: {
    name: 'Largest Contentful Paint',
    description: 'Time until the largest visible content element renders. Measures loading performance.',
    good: 2500,
    poor: 4000,
    format: (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`,
    thresholdLabels: { good: '≤ 2.5s', ni: '2.5s – 4s', poor: '> 4s' },
  },
  inp: {
    name: 'Interaction to Next Paint',
    description: 'Responsiveness to user input. Measures interactivity latency.',
    good: 200,
    poor: 500,
    format: (ms: number) => `${Math.round(ms)}ms`,
    thresholdLabels: { good: '≤ 200ms', ni: '200 – 500ms', poor: '> 500ms' },
  },
  cls: {
    name: 'Cumulative Layout Shift',
    description: 'Visual stability score. Measures how much page content shifts during loading.',
    good: 0.1,
    poor: 0.25,
    format: (v: number) => v.toFixed(2),
    thresholdLabels: { good: '≤ 0.1', ni: '0.1 – 0.25', poor: '> 0.25' },
  },
}

const config = computed(() => CWV_CONFIG[metric])

const latestValue = computed<number | null>(() => {
  if (!history.length)
    return null
  const last = history.findLast(e => e.value > 0)
  return last?.value ?? null
})

const status = computed(() => {
  if (latestValue.value == null)
    return 'neutral' as const
  return thresholdToSemantic(latestValue.value, config.value.good, config.value.poor)
})

const trend = computed(() => {
  if (history.length < 2)
    return null
  const first = history[0]!.value
  const last = history.at(-1)!.value
  if (first === 0)
    return null
  return calcTrendPercent(last, first)
})

const distribution = computed(() => {
  const valid = history.filter(e => e.value > 0)
  if (!valid.length)
    return null

  const withHistogram = valid.filter(e => e.good != null && e.ni != null && e.poor != null)
  if (withHistogram.length) {
    const avgGood = Math.round(withHistogram.reduce((s, e) => s + e.good!, 0) / withHistogram.length)
    const avgPoor = Math.round(withHistogram.reduce((s, e) => s + e.poor!, 0) / withHistogram.length)
    return { good: avgGood, ni: 100 - avgGood - avgPoor, poor: avgPoor }
  }

  const { good, poor } = config.value
  const total = valid.length
  const goodCount = valid.filter(e => e.value <= good).length
  const poorCount = valid.filter(e => e.value > poor).length
  return {
    good: Math.round((goodCount / total) * 100),
    ni: Math.round(((total - goodCount - poorCount) / total) * 100),
    poor: Math.round((poorCount / total) * 100),
  }
})

function trendArrow(v: number) {
  if (v > 0)
    return '↑'
  if (v < 0)
    return '↓'
  return '→'
}
</script>

<template>
  <UCard variant="subtle">
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-default">{{ config.name }}</span>
        <UTooltip :text="config.description">
          <UIcon name="i-lucide-circle-help" class="size-3 text-dimmed hover:text-muted transition-colors cursor-help" />
        </UTooltip>
      </div>

      <div v-if="loading" class="space-y-2">
        <USkeleton class="h-8 w-24 rounded" />
        <USkeleton class="h-3 w-32 rounded" />
      </div>
      <div v-else-if="latestValue != null" class="flex items-baseline gap-2">
        <span
          class="text-3xl font-bold tabular-nums tracking-tight"
          :class="[semanticColors[status].text]"
        >
          {{ config.format(latestValue) }}
        </span>
        <span
          v-if="trend != null && trend !== 0"
          class="text-xs font-medium tabular-nums"
          :class="trend > 0 ? 'text-error' : 'text-success'"
        >
          {{ trendArrow(trend) }} {{ Math.abs(trend).toFixed(0) }}%
        </span>
      </div>
      <div v-else class="flex items-baseline gap-2">
        <span class="text-3xl font-bold tabular-nums tracking-tight text-dimmed">—</span>
      </div>

      <UPopover v-if="!loading && distribution" mode="hover" :content="{ side: 'bottom' }" class="block w-full">
        <div class="flex h-4 rounded-md overflow-hidden cursor-default w-full">
          <div
            class="bg-success/75 flex items-center justify-center transition-[width] duration-300"
            :style="{ width: `${distribution.good}%` }"
          >
            <span v-if="distribution.good > 15" class="text-[10px] font-semibold text-highlighted tabular-nums">
              {{ distribution.good }}%
            </span>
          </div>
          <div
            class="bg-warning/75 flex items-center justify-center transition-[width] duration-300"
            :style="{ width: `${distribution.ni}%` }"
          >
            <span v-if="distribution.ni > 15" class="text-[10px] font-semibold text-highlighted tabular-nums">
              {{ distribution.ni }}%
            </span>
          </div>
          <div
            class="bg-error/75 flex items-center justify-center transition-[width] duration-300"
            :style="{ width: `${distribution.poor}%` }"
          >
            <span v-if="distribution.poor > 15" class="text-[10px] font-semibold text-highlighted tabular-nums">
              {{ distribution.poor }}%
            </span>
          </div>
        </div>
        <template #content>
          <div class="p-3 text-xs space-y-2 max-w-[280px]">
            <div class="font-semibold text-default">
              P75 distribution over period
            </div>
            <div class="text-muted">
              How many weekly data points fall in each range:
            </div>
            <div class="space-y-1">
              <div class="flex justify-between items-center gap-4">
                <span class="flex items-center gap-2 text-muted">
                  <span class="size-2 rounded-full bg-success" />
                  Good ({{ config.thresholdLabels.good }})
                </span>
                <span class="font-mono tabular-nums text-muted">{{ distribution.good }}%</span>
              </div>
              <div class="flex justify-between items-center gap-4">
                <span class="flex items-center gap-2 text-muted">
                  <span class="size-2 rounded-full bg-warning" />
                  NI ({{ config.thresholdLabels.ni }})
                </span>
                <span class="font-mono tabular-nums text-muted">{{ distribution.ni }}%</span>
              </div>
              <div class="flex justify-between items-center gap-4">
                <span class="flex items-center gap-2 text-muted">
                  <span class="size-2 rounded-full bg-error" />
                  Poor ({{ config.thresholdLabels.poor }})
                </span>
                <span class="font-mono tabular-nums text-muted">{{ distribution.poor }}%</span>
              </div>
            </div>
          </div>
        </template>
      </UPopover>
      <div v-else-if="!loading" class="h-4 rounded-md w-full border border-dashed border-default" aria-hidden="true" />

      <CruxMetricChart
        :metric="metric"
        :data="history"
        :loading="loading"
        :height="140"
      />
    </div>
  </UCard>
</template>
