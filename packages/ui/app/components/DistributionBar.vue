<script setup lang="ts">
// App-global (D-051): one segmented threshold-band bar, consolidating the
// three hand-rolled implementations that grew independently — the scan
// overview distribution strip, and MetricStatCard's per-route histogram.
// Dumb/presentational: caller buckets its own values into segments; this
// only lays out + colors + annotates them. Colors ride the semantic palette
// (never inlined), per DESIGN.md's color-budget rule.

export interface DistributionSegment {
  label: string
  count: number
  status: SemanticStatus
}

const props = defineProps<{
  segments: DistributionSegment[]
}>()

const total = computed(() => props.segments.reduce((sum, s) => sum + s.count, 0))
const visible = computed(() => props.segments.filter(s => s.count > 0))

function pct(count: number): number {
  return total.value > 0 ? (count / total.value) * 100 : 0
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex h-3 rounded-full overflow-hidden bg-muted">
      <div
        v-for="seg in visible"
        :key="seg.label"
        :style="{ width: `${pct(seg.count)}%` }"
        :class="semanticColors[seg.status].dot"
        :title="`${seg.label}: ${seg.count} (${Math.round(pct(seg.count))}%)`"
      />
    </div>
    <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
      <span v-for="seg in visible" :key="seg.label" class="inline-flex items-baseline gap-1">
        <span class="tabular-nums">{{ seg.count }}</span>
        <span>{{ seg.label }}</span>
      </span>
    </div>
  </div>
</template>
