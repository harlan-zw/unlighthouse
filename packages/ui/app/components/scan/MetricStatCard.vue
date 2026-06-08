<script setup lang="ts">
// Expo-Observe-style metric card: a headline p75, a threshold-coloured
// distribution histogram across the scan's routes, and a Median/Avg/Min/Max/
// P75/P95 stat row. Pure presentational — pass the raw per-route values.

const props = defineProps<{
  label: string
  hint?: string
  values: Array<number | null | undefined>
  // [good, poor] thresholds — colours the headline + histogram bars.
  thresholds: [number, number]
  format: (v: number) => string
}>()

const stats = computed(() => metricStats(props.values))

const BINS = 18
const histogram = computed(() => {
  const s = stats.value
  if (!s)
    return [] as Array<{ h: number, color: string, count: number, center: number }>
  const span = (s.max - s.min) || 1
  const bins = Array.from({ length: BINS }, (_, i) => ({ count: 0, center: s.min + ((i + 0.5) / BINS) * span }))
  for (const v of s.sorted) {
    let idx = Math.floor(((v - s.min) / span) * BINS)
    if (idx >= BINS) idx = BINS - 1
    if (idx < 0) idx = 0
    bins[idx]!.count++
  }
  const maxCount = Math.max(...bins.map(b => b.count), 1)
  return bins.map(b => ({ h: b.count / maxCount, count: b.count, center: b.center, color: zoneColor(b.center) }))
})

function zoneColor(v: number): string {
  const [good, poor] = props.thresholds
  return v <= good ? '#22c55e' : v <= poor ? '#f97316' : '#ef4444'
}
function zoneText(v: number | null): string {
  if (v == null)
    return 'text-muted'
  const [good, poor] = props.thresholds
  return v <= good ? 'text-success' : v <= poor ? 'text-warning' : 'text-error'
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
        <span v-if="stats" class="text-mini text-muted/70 tabular-nums">{{ stats.count }} routes</span>
      </div>

      <template v-if="stats">
        <div class="mt-1 flex items-baseline gap-2">
          <span class="numerals-display text-2xl" :class="zoneText(stats.p75)">{{ format(stats.p75) }}</span>
          <span class="text-label text-muted">p75</span>
        </div>

        <!-- Distribution histogram -->
        <div class="mt-3 flex items-end gap-px h-12">
          <div
            v-for="(b, i) in histogram"
            :key="i"
            class="flex-1 rounded-t-sm transition-all"
            :style="{ height: `${Math.max(3, b.h * 100)}%`, backgroundColor: b.color, opacity: b.count ? 1 : 0.25 }"
            :title="`${format(b.center)} — ${b.count} route${b.count === 1 ? '' : 's'}`"
          />
        </div>

        <!-- Percentile stat row -->
        <div class="mt-3 grid grid-cols-6 gap-1 border-t pt-2">
          <div v-for="c in statCols" :key="c.label" class="text-center">
            <div class="text-micro text-muted">{{ c.label }}</div>
            <div class="numerals-display text-[11px] mt-0.5">{{ c.val }}</div>
          </div>
        </div>
      </template>

      <div v-else class="py-6 text-center text-xs text-muted">No data</div>
  </UiCard>
</template>
