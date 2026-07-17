<script setup lang="ts">
import type { UiStatProps } from '#layers/design-system/app/components/data/UiStat.vue'
import { useScanStore } from '~/stores/scan'
import ScanTerminal from './ScanTerminal.vue'

const store = useScanStore()
const { scoreToLabel, scoreToColor } = createScoreColorHelpers()
const expanded = ref(true)

// Re-render the ETA + elapsed labels every second while the scan is
// active. ETA in the store derives from Date.now() and is otherwise
// only recomputed when scanned/total change — without this tick the
// numbers freeze between route completions on slow scans.
const now = ref<number | null>(null)
let tickHandle: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  now.value = Date.now()
  tickHandle = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (tickHandle)
    clearInterval(tickHandle)
})

const elapsedLabel = computed(() => {
  if (!store.startedAt || now.value == null)
    return '—'
  const ms = now.value - new Date(store.startedAt).getTime()
  return formatDuration(ms)
})

const etaLabel = computed(() => {
  // Touch `now` so the ETA recomputes each tick even when store.etaMs
  // returned a value but `scanned`/`total` haven't changed yet.
  if (now.value == null)
    return '—'
  const ms = store.etaMs
  if (ms == null)
    return '—'
  if (ms < 1000)
    return '<1s'
  return formatDuration(ms)
})

const { fmtDuration: formatDurationHelper } = createFormatters()
function formatDuration(ms: number): string {
  // Local wrapper preserves the "<1s" sentinel and the never-null
  // contract this component relied on before createFormatters was extracted.
  // fmtDuration returns '—' for null; ScanProgress always has a real
  // number by the time it calls this.
  return formatDurationHelper(ms)
}

// D-051: the two hand-rolled count grids re-platform onto UiStats (inline,
// compact) — one shared primitive instead of two ad-hoc `grid-cols-N` blocks.
const countStats = computed<UiStatProps[]>(() => [
  { title: 'Routes found', value: store.total },
  { title: 'Audited', value: store.scanned },
  { title: 'Failed', value: store.failed, valueClass: store.failed > 0 ? 'text-error' : undefined },
  { title: 'Remaining', value: Math.max(0, store.total - store.scanned - store.failed) },
])

const scoringStats = computed<UiStatProps[]>(() => [
  { title: 'Avg Perf', value: store.avgPerfScore != null ? scoreToLabel(store.avgPerfScore) : '—', valueClass: scoreToColor(store.avgPerfScore) },
  { title: 'Pass', value: store.passCount, valueClass: 'text-success' },
  { title: 'Needs Work', value: store.needsWorkCount, valueClass: 'text-warning' },
  { title: 'Poor', value: store.poorCount, valueClass: 'text-error' },
  // Stable title (used as the v-for key) — elapsed rides the trendLabel slot
  // instead of being interpolated into the title, so the tick doesn't remount
  // (and re-trigger UiStat's value roll-up animation) every second.
  { title: 'ETA', value: etaLabel.value, trendLabel: `· ${elapsedLabel.value}` },
])
</script>

<template>
  <div class="rounded-lg border border-info/30 bg-info/5 p-4 space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="relative flex size-2">
          <span class="absolute inline-flex size-full motion-safe:animate-ping rounded-full bg-info opacity-75" />
          <span class="relative inline-flex size-2 rounded-full bg-info" />
        </span>
        <span class="text-sm font-medium capitalize">{{ store.status }}</span>
        <span class="text-sm text-muted truncate max-w-xs">{{ store.site }}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium tabular-nums">{{ store.percent }}%</span>
        <button
          type="button"
          class="inline-flex size-11 items-center justify-center rounded text-muted hover:text-default transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:size-8"
          :aria-label="expanded ? 'Collapse scan progress' : 'Expand scan progress'"
          :aria-expanded="expanded"
          aria-controls="scan-progress-terminal"
          @click="expanded = !expanded"
        >
          <UiIcon :name="expanded ? 'chevron-up' : 'chevron-down'" class="size-4" />
        </button>
      </div>
    </div>

    <UProgress :model-value="store.percent" size="sm" aria-label="Scan progress" />

    <!-- Counts row — crawler-side numbers. `discovered`/`total` track the same
           thing (same-host routes found so far), so we show Routes once and use
           the fourth slot for the live remaining count rather than duplicating. -->
    <UiStats variant="inline" size="sm" :data="countStats" />

    <!-- Scoring row — appears once at least one audit produced a perf
           score. Avg + bucket counts + ETA give the user "is this going
           well + how long to wait" at a glance. -->
    <UiStats v-if="store.scoreCount > 0 || store.etaMs != null" variant="inline" size="sm" :data="scoringStats" class="border-t pt-3" />

    <!-- Terminal -->
    <div v-if="expanded" id="scan-progress-terminal">
      <ScanTerminal />
    </div>
  </div>
</template>
