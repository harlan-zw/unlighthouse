<script setup lang="ts">
import type { DistributionSegment } from '~/components/DistributionBar.vue'
import { metricStats } from '~/features/scan/metric-stats'

// Expo-Observe-style metric card: a headline p75, a threshold-coloured
// distribution bar across the scan's routes, and a Median/Avg/Min/Max/P75/P95
// stat row. Pure presentational — pass the raw per-route values.
//
// D-051: the per-bin histogram (18 continuous bins) re-platforms onto the
// shared DistributionBar — a coarser 3-band good/needs-improvement/poor
// summary instead of a fine-grained bar chart, consolidating with the scan
// overview strip's identical band-bar pattern.

const props = defineProps<{
  label: string
  hint?: string
  values: Array<number | null | undefined>
  // [good, poor] thresholds — colours the headline + distribution bands.
  // Readonly so callers can pass the shared CWV_THRESHOLDS tuples directly.
  thresholds: readonly [number, number]
  format: (v: number) => string
}>()

const stats = computed(() => metricStats(props.values))

const distributionSegments = computed<DistributionSegment[]>(() => {
  const counts = { good: 0, average: 0, poor: 0 }
  for (const v of props.values) {
    const band = bandFromBounds(v ?? null, props.thresholds[0], props.thresholds[1])
    if (band)
      counts[band]++
  }
  return [
    { label: 'Good', count: counts.good, status: 'success' },
    { label: 'Needs improvement', count: counts.average, status: 'warning' },
    { label: 'Poor', count: counts.poor, status: 'error' },
  ]
})

function zoneText(v: number | null): string {
  switch (bandFromBounds(v, props.thresholds[0], props.thresholds[1])) {
    case 'good': return 'text-success'
    case 'average': return 'text-warning'
    case 'poor': return 'text-error'
    default: return 'text-muted'
  }
}

const statCols = computed(() => {
  const s = stats.value
  if (!s)
    return []
  return [
    { label: 'Median', val: props.format(s.median) },
    { label: 'Avg', val: props.format(s.avg) },
    { label: 'Min', val: props.format(s.min) },
    { label: 'Max', val: props.format(s.max) },
    { label: 'P75', val: props.format(s.p75) },
    { label: 'P95', val: props.format(s.p95) },
  ]
})
</script>

<template>
  <UiCard size="sm">
    <div class="flex items-center justify-between">
      <span class="text-label text-muted">{{ label }}</span>
      <span v-if="stats" class="text-xs text-muted tabular-nums">{{ stats.count }} routes</span>
    </div>

    <template v-if="stats">
      <div class="mt-1 flex items-baseline gap-2">
        <span class="numerals-display text-2xl" :class="zoneText(stats.p75)">{{ format(stats.p75) }}</span>
        <span class="text-label text-muted">p75</span>
      </div>

      <!-- Distribution — good/needs-improvement/poor bands -->
      <DistributionBar class="mt-3" :segments="distributionSegments" />

      <!-- Percentile stat row -->
      <div class="mt-3 grid grid-cols-6 gap-1 border-t pt-2">
        <div v-for="c in statCols" :key="c.label" class="text-center">
          <div class="text-xs text-muted">
            {{ c.label }}
          </div>
          <div class="numerals-display text-xs mt-0.5">
            {{ c.val }}
          </div>
        </div>
      </div>
    </template>

    <div v-else class="py-6 text-center text-xs text-muted">
      No data
    </div>
  </UiCard>
</template>
