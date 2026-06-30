<script setup lang="ts">
import { useScanStore } from '~/stores/scan'
import ScanTerminal from './ScanTerminal.vue'

const store = useScanStore()
const { scoreToLabel, scoreToColor } = useScoreColor()
const expanded = ref(true)

// Re-render the ETA + elapsed labels every second while the scan is
// active. ETA in the store derives from Date.now() and is otherwise
// only recomputed when scanned/total change — without this tick the
// numbers freeze between route completions on slow scans.
const now = ref(Date.now())
let tickHandle: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tickHandle = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (tickHandle)
    clearInterval(tickHandle)
})

const elapsedLabel = computed(() => {
  if (!store.startedAt)
    return '—'
  const ms = now.value - new Date(store.startedAt).getTime()
  return formatDuration(ms)
})

const etaLabel = computed(() => {
  // Touch `now` so the ETA recomputes each tick even when store.etaMs
  // returned a value but `scanned`/`total` haven't changed yet.
  void now.value
  const ms = store.etaMs
  if (ms == null)
    return '—'
  if (ms < 1000)
    return '<1s'
  return formatDuration(ms)
})

const { fmtDuration: formatDurationHelper } = useFormat()
function formatDuration(ms: number): string {
  // Local wrapper preserves the "<1s" sentinel and the never-null
  // contract this component relied on before useFormat was extracted.
  // fmtDuration returns '—' for null; ScanProgress always has a real
  // number by the time it calls this.
  return formatDurationHelper(ms)
}
</script>

<template>
  <div class="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="relative flex size-2">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
          <span class="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        <span class="text-sm font-medium capitalize">{{ store.status }}</span>
        <span class="text-sm text-muted truncate max-w-xs">{{ store.site }}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium tabular-nums">{{ store.percent }}%</span>
        <button
          class="text-muted hover:text-default transition-colors"
          @click="expanded = !expanded"
        >
          <UiIcon :name="expanded ? 'chevron-up' : 'chevron-down'" class="size-4" />
        </button>
      </div>
    </div>

    <UProgress :model-value="store.percent" size="sm" />

    <!-- Counts row — crawler-side numbers. `discovered`/`total` track the same
           thing (same-host pages found so far), so we show Pages once and use
           the fourth slot for the live remaining count rather than duplicating. -->
    <div class="grid grid-cols-4 gap-3 text-center text-xs">
      <div>
        <div class="numerals-display text-base">
          {{ store.total }}
        </div>
        <div class="text-muted">
          Pages found
        </div>
      </div>
      <div>
        <div class="numerals-display text-base">
          {{ store.scanned }}
        </div>
        <div class="text-muted">
          Audited
        </div>
      </div>
      <div>
        <div class="numerals-display text-base" :class="store.failed > 0 ? 'text-error' : ''">
          {{ store.failed }}
        </div>
        <div class="text-muted">
          Failed
        </div>
      </div>
      <div>
        <div class="numerals-display text-base">
          {{ Math.max(0, store.total - store.scanned - store.failed) }}
        </div>
        <div class="text-muted">
          Remaining
        </div>
      </div>
    </div>

    <!-- Scoring row — appears once at least one audit produced a perf
           score. Avg + bucket counts + ETA give the user "is this going
           well + how long to wait" at a glance. -->
    <div v-if="store.scoreCount > 0 || store.etaMs != null" class="grid grid-cols-5 gap-3 text-center text-xs border-t pt-3">
      <div>
        <div class="numerals-display text-base" :class="scoreToColor(store.avgPerfScore)">
          {{ store.avgPerfScore != null ? scoreToLabel(store.avgPerfScore) : '—' }}
        </div>
        <div class="text-muted">
          Avg Perf
        </div>
      </div>
      <div>
        <div class="numerals-display text-base text-success">
          {{ store.passCount }}
        </div>
        <div class="text-muted">
          Pass
        </div>
      </div>
      <div>
        <div class="numerals-display text-base text-warning">
          {{ store.needsWorkCount }}
        </div>
        <div class="text-muted">
          Needs Work
        </div>
      </div>
      <div>
        <div class="numerals-display text-base text-error">
          {{ store.poorCount }}
        </div>
        <div class="text-muted">
          Poor
        </div>
      </div>
      <div>
        <div class="numerals-display text-base">
          {{ etaLabel }}
        </div>
        <div class="text-muted">
          ETA · {{ elapsedLabel }}
        </div>
      </div>
    </div>

    <!-- Terminal -->
    <ScanTerminal v-if="expanded" />
  </div>
</template>
