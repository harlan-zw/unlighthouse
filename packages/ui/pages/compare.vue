<script setup lang="ts">
// Comparable runs view — closes #20. Query-param driven so URLs are shareable:
//   /compare?base=<scanId>&current=<scanId>
//
// The handlers (`compare.run` + `compare.markdown`) live in core; this page is
// pure consumption — picker → fetch → render. We deliberately keep the page
// self-contained rather than carving it up into sub-components: the diff
// shape is unique to this view and won't be reused elsewhere.

import type { CompareReport, RouteDiff, Scan } from '@unlighthouse/contracts'
import { siteHostname } from '~/composables/sites'
import { useApiClient } from '~/composables/useApiClient'
import { useCompare } from '~/composables/useCompare'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const router = useRouter()
const client = useApiClient()

// ── Picker state ────────────────────────────────────────────────────────────
// Read params reactively so back/forward navigation works, and write them
// back when the user changes a picker so the URL stays shareable.
const baseScanId = computed<string | undefined>({
  get: () => (route.query.base as string | undefined) || undefined,
  set: (v) => {
    router.replace({ query: { ...route.query, base: v || undefined } })
  },
})
const currentScanId = computed<string | undefined>({
  get: () => (route.query.current as string | undefined) || undefined,
  set: (v) => {
    router.replace({ query: { ...route.query, current: v || undefined } })
  },
})

// ── Scan list (for the pickers) ─────────────────────────────────────────────
// Fetch the most recent 500 scans and filter to `status === 'complete'`.
// A completed scan is the only kind that has meaningful summary scores to
// diff, so the picker hides the rest.
const { data: scansData, pending: scansPending } = await useAsyncData(
  'compare:scans',
  async () => {
    const res = await client['history.list']({ page: 1, pageSize: 500 })
    return res.items ?? []
  },
)

// Only scans that actually produced score data — a structurally `complete`
// scan with `scoreAverage === null` (e.g. sandbox blocked every audit) makes
// a pointless diff target, so we hide them from the picker.
const completeScans = computed<Scan[]>(() =>
  (scansData.value ?? []).filter(
    s => s.status === 'complete' && s.summary?.scoreAverage != null,
  ),
)

function fmtScanLabel(s: Scan): string {
  const date = new Date(s.startedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  const host = siteHostname(s.site)
  const branch = s.ciBranch ? ` · ${s.ciBranch}` : ''
  return `${host} (${s.device}) — ${date}${branch}`
}

// Cast `value` to a plain string — `scan.scanId` is branded (`ScanId`),
// and USelectMenu's v-model inference propagates the brand which then clashes
// with the `string | undefined` accessor that drives the URL query state.
const scanOptions = computed(() => completeScans.value.map(s => ({
  label: fmtScanLabel(s),
  value: s.scanId as string,
})))

// ── Compare run ─────────────────────────────────────────────────────────────
const { report, pending: comparing, error: compareError, fetchMarkdown } = useCompare(
  baseScanId,
  currentScanId,
)

// Headline overall score delta is derived from each scan's summary, not the
// diff report itself (which is route × metric granular). The contract guarantees
// `summary.scoreAverage` is null until at least one route scores, so we mirror
// that null-safety here.
const baseScan = computed(() => completeScans.value.find(s => s.scanId === baseScanId.value) ?? null)
const currentScan = computed(() => completeScans.value.find(s => s.scanId === currentScanId.value) ?? null)

function pct(s: number | null | undefined): number | null {
  return s == null ? null : Math.round(s * 100)
}

const overallBase = computed(() => pct(baseScan.value?.summary?.scoreAverage))
const overallCurrent = computed(() => pct(currentScan.value?.summary?.scoreAverage))
const overallDelta = computed(() => {
  if (overallBase.value == null || overallCurrent.value == null)
    return null
  return overallCurrent.value - overallBase.value
})

// ── Diff table rows ─────────────────────────────────────────────────────────
// Re-shape RouteDiff so the table cells stay simple. Sort regressions by most
// negative delta first, improvements by most positive — same ordering the
// markdown renderer uses (`pickTopRouteDiffs` in handlers/compare.ts).
interface DiffRow {
  url: string
  path: string
  device: string
  metric: string
  base: number | null
  current: number | null
  delta: number
  isScore: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'seo': 'SEO',
  'best-practices': 'Best Practices',
}

function metricLabel(metric: string): string {
  return CATEGORY_LABELS[metric] ?? metric.toUpperCase()
}

function isScoreMetric(metric: string): boolean {
  return metric in CATEGORY_LABELS
}

function toRow(d: RouteDiff): DiffRow {
  let path = d.url
  try {
    path = new URL(d.url).pathname || '/'
  }
  catch {}
  return {
    url: d.url,
    path,
    device: d.device,
    metric: d.metric,
    base: d.base,
    current: d.current,
    delta: d.delta,
    isScore: isScoreMetric(d.metric),
  }
}

function sortedRows(diffs: RouteDiff[] | undefined, mode: 'regression' | 'improvement'): DiffRow[] {
  if (!diffs?.length)
    return []
  const rows = diffs.map(toRow)
  rows.sort((a, b) => mode === 'regression' ? a.delta - b.delta : b.delta - a.delta)
  return rows
}

const regressionRows = computed(() => sortedRows(report.value?.regressions, 'regression'))
const improvementRows = computed(() => sortedRows(report.value?.improvements, 'improvement'))

// Format a cell value. Score metrics live in 0..1; everything else is in its
// native unit (ms / unitless for CLS).
function fmtVal(v: number | null, isScore: boolean): string {
  if (v == null)
    return '—'
  if (isScore)
    return String(Math.round(v * 100))
  // CLS is unitless and small; everything else is ms.
  if (Math.abs(v) < 5)
    return v.toFixed(3)
  return `${Math.round(v)}ms`
}

function fmtDelta(d: number, isScore: boolean): string {
  if (isScore) {
    const v = Math.round(d * 100)
    return v > 0 ? `+${v}` : `${v}`
  }
  if (Math.abs(d) < 5)
    return d > 0 ? `+${d.toFixed(3)}` : d.toFixed(3)
  const v = Math.round(d)
  return v > 0 ? `+${v}ms` : `${v}ms`
}

// ── Per-route expansion ─────────────────────────────────────────────────────
// Bucket all diffs (regressions + improvements) by (url, device) so clicking a
// row reveals every metric that moved for that route, not just the worst one.
type RouteKey = string
function routeKey(d: { url: string, device: string }): RouteKey {
  return `${d.url}|${d.device}`
}

const allRoutes = computed(() => {
  if (!report.value)
    return new Map<RouteKey, DiffRow[]>()
  const map = new Map<RouteKey, DiffRow[]>()
  for (const d of [...report.value.regressions, ...report.value.improvements]) {
    const k = routeKey(d)
    const row = toRow(d)
    const arr = map.get(k) ?? []
    arr.push(row)
    map.set(k, arr)
  }
  return map
})

const expanded = ref(new Set<RouteKey>())
function toggleRow(row: DiffRow) {
  const k = routeKey(row)
  const next = new Set(expanded.value)
  next.has(k) ? next.delete(k) : next.add(k)
  expanded.value = next
}
function isExpanded(row: DiffRow): boolean {
  return expanded.value.has(routeKey(row))
}
function routeDetails(row: DiffRow): DiffRow[] {
  return allRoutes.value.get(routeKey(row)) ?? []
}

// ── Copy as Markdown ────────────────────────────────────────────────────────
const copyState = ref<'idle' | 'copying' | 'copied' | 'error'>('idle')
async function copyMarkdown() {
  copyState.value = 'copying'
  try {
    const out = await fetchMarkdown()
    if (!out?.markdown)
      throw new Error('Empty markdown')
    await navigator.clipboard.writeText(out.markdown)
    copyState.value = 'copied'
    setTimeout(() => { copyState.value = 'idle' }, 2000)
  }
  catch {
    copyState.value = 'error'
    setTimeout(() => { copyState.value = 'idle' }, 3000)
  }
}

function swapScans() {
  const b = baseScanId.value
  const c = currentScanId.value
  router.replace({ query: { ...route.query, base: c, current: b } })
}

// Headline classes for the overall delta — green for improvement, red for
// regression, neutral for "no change". Mirrors the handler's verdict logic.
const deltaTone = computed<'improved' | 'regressed' | 'neutral'>(() => {
  const d = overallDelta.value
  if (d == null || Math.abs(d) < 1)
    return 'neutral'
  return d > 0 ? 'improved' : 'regressed'
})

const hasBoth = computed(() => !!baseScanId.value && !!currentScanId.value && baseScanId.value !== currentScanId.value)
</script>

<template>
  <div>
    <header class="mb-6">
      <h1 class="text-xl font-semibold text-highlighted">
        Compare scans
      </h1>
      <p class="text-sm text-muted mt-1">
        Diff two completed scans to surface regressions and improvements across routes.
      </p>
    </header>

    <!-- Empty state: not enough scans to compare. -->
    <div
      v-if="!scansPending && completeScans.length < 2"
      class="rounded-sm ring-1 ring-default bg-elevated/40 px-6 py-16 text-center"
    >
      <UIcon name="i-heroicons-scale" class="size-8 text-dimmed mx-auto mb-3" />
      <p class="text-muted mb-4">
        Run at least 2 scans to compare. You currently have
        {{ completeScans.length }} completed scan{{ completeScans.length === 1 ? '' : 's' }}.
      </p>
      <UiButton to="/" icon="i-heroicons-bolt" purpose="cta">
        Go to sites
      </UiButton>
    </div>

    <template v-else>
      <!-- Picker row -->
      <UiCard class="mb-6">
        <div class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-3 items-center">
          <div>
            <label class="block text-xs text-dimmed mb-1.5">Base scan</label>
            <USelectMenu
              v-model="baseScanId"
              :items="scanOptions"
              value-key="value"
              placeholder="Select base…"
              size="sm"
              class="w-full"
              :loading="scansPending"
            />
          </div>

          <div class="hidden md:flex pt-5 justify-center">
            <UiButton
              purpose="quiet"
              icon="i-heroicons-arrows-right-left"
              size="sm"
              :disabled="!hasBoth"
              aria-label="Swap base and current"
              @click="swapScans"
            />
          </div>

          <div>
            <label class="block text-xs text-dimmed mb-1.5">Current scan</label>
            <USelectMenu
              v-model="currentScanId"
              :items="scanOptions"
              value-key="value"
              placeholder="Select current…"
              size="sm"
              class="w-full"
              :loading="scansPending"
            />
          </div>

          <div class="pt-5 md:pl-2">
            <UiButton
              icon="i-heroicons-clipboard-document"
              purpose="secondary"
              size="sm"
              :disabled="!hasBoth || comparing || copyState === 'copying'"
              :loading="copyState === 'copying'"
              @click="copyMarkdown"
            >
              <span v-if="copyState === 'copied'">Copied</span>
              <span v-else-if="copyState === 'error'">Failed</span>
              <span v-else>Copy as Markdown</span>
            </UiButton>
          </div>
        </div>

        <p v-if="hasBoth && baseScanId === currentScanId" class="text-xs text-warning mt-3">
          Base and current scans are the same — pick different scans.
        </p>
      </UiCard>

      <!-- Pre-selection prompt -->
      <div
        v-if="!hasBoth"
        class="rounded-sm ring-1 ring-default bg-elevated/40 px-6 py-16 text-center"
      >
        <UIcon name="i-heroicons-arrows-pointing-out" class="size-8 text-dimmed mx-auto mb-3" />
        <p class="text-muted">
          Select two completed scans above to see what changed between them.
        </p>
      </div>

      <!-- Loading -->
      <div v-else-if="comparing" class="text-sm text-dimmed">
        Comparing scans…
      </div>

      <!-- Error -->
      <div
        v-else-if="compareError"
        class="rounded-sm ring-1 ring-error/40 bg-error/5 px-4 py-3 text-sm text-error"
      >
        Failed to compare scans: {{ compareError.message }}
      </div>

      <!-- Diff view -->
      <template v-else-if="report">
        <!-- Headline -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div class="rounded-sm ring-1 ring-default bg-elevated/40 px-4 py-3">
            <div class="text-[11px] uppercase tracking-widest text-dimmed">
              Regressions
            </div>
            <div class="text-2xl font-semibold text-error mt-1">
              {{ report.regressions.length }}
            </div>
          </div>
          <div class="rounded-sm ring-1 ring-default bg-elevated/40 px-4 py-3">
            <div class="text-[11px] uppercase tracking-widest text-dimmed">
              Improvements
            </div>
            <div class="text-2xl font-semibold text-success mt-1">
              {{ report.improvements.length }}
            </div>
          </div>
          <div class="rounded-sm ring-1 ring-default bg-elevated/40 px-4 py-3">
            <div class="text-[11px] uppercase tracking-widest text-dimmed">
              Overall score
            </div>
            <div class="mt-1 flex items-baseline gap-2">
              <span class="text-2xl font-semibold text-highlighted">
                {{ overallCurrent ?? '—' }}
              </span>
              <span class="text-xs text-dimmed">/ 100</span>
              <span
                v-if="overallDelta != null"
                class="text-sm font-medium"
                :class="deltaTone === 'improved' ? 'text-success' : deltaTone === 'regressed' ? 'text-error' : 'text-muted'"
              >
                {{ overallDelta > 0 ? `+${overallDelta}` : overallDelta }}
                <span class="text-dimmed">vs {{ overallBase ?? '—' }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Tables -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Regressions -->
          <section>
            <h2 class="text-sm font-semibold text-highlighted mb-2 flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-trending-down" class="size-4 text-error" />
              Regressions
              <span class="text-xs text-dimmed font-normal">({{ regressionRows.length }})</span>
            </h2>
            <div v-if="!regressionRows.length" class="rounded-sm ring-1 ring-default bg-elevated/40 px-4 py-6 text-center text-sm text-dimmed">
              No regressions detected.
            </div>
            <div v-else class="rounded-sm ring-1 ring-default bg-elevated/40 overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-elevated/60 text-xs text-dimmed">
                  <tr>
                    <th class="text-left font-medium px-3 py-2">
                      Route
                    </th>
                    <th class="text-left font-medium px-3 py-2">
                      Metric
                    </th>
                    <th class="text-right font-medium px-3 py-2">
                      Base
                    </th>
                    <th class="text-right font-medium px-3 py-2">
                      Current
                    </th>
                    <th class="text-right font-medium px-3 py-2">
                      Δ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in regressionRows" :key="`r-${row.url}-${row.device}-${row.metric}`">
                    <tr
                      class="border-t border-default hover:bg-elevated/60 cursor-pointer transition-colors"
                      @click="toggleRow(row)"
                    >
                      <td class="px-3 py-2 max-w-0">
                        <div class="flex items-center gap-1.5">
                          <UIcon
                            name="i-heroicons-chevron-right"
                            class="size-3 text-dimmed transition-transform shrink-0"
                            :class="{ 'rotate-90': isExpanded(row) }"
                          />
                          <span class="font-mono text-xs truncate" :title="row.url">{{ row.path }}</span>
                          <span class="text-[10px] text-dimmed shrink-0">({{ row.device }})</span>
                        </div>
                      </td>
                      <td class="px-3 py-2 text-muted text-xs whitespace-nowrap">
                        {{ metricLabel(row.metric) }}
                      </td>
                      <td class="px-3 py-2 text-right text-muted">
                        {{ fmtVal(row.base, row.isScore) }}
                      </td>
                      <td class="px-3 py-2 text-right text-highlighted">
                        {{ fmtVal(row.current, row.isScore) }}
                      </td>
                      <td class="px-3 py-2 text-right text-error font-medium whitespace-nowrap">
                        {{ fmtDelta(row.delta, row.isScore) }}
                      </td>
                    </tr>
                    <tr v-if="isExpanded(row)" class="border-t border-default bg-default/40">
                      <td colspan="5" class="px-3 py-2">
                        <div class="text-[11px] text-dimmed uppercase tracking-widest mb-1.5">
                          All changes for this route
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div v-for="d in routeDetails(row)" :key="`d-${d.metric}`" class="flex items-center justify-between gap-2">
                            <span class="text-muted">{{ metricLabel(d.metric) }}</span>
                            <span :class="d.delta > 0 === d.isScore ? 'text-success' : 'text-error'" class="font-mono">
                              {{ fmtVal(d.base, d.isScore) }} → {{ fmtVal(d.current, d.isScore) }}
                              ({{ fmtDelta(d.delta, d.isScore) }})
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Improvements -->
          <section>
            <h2 class="text-sm font-semibold text-highlighted mb-2 flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-trending-up" class="size-4 text-success" />
              Improvements
              <span class="text-xs text-dimmed font-normal">({{ improvementRows.length }})</span>
            </h2>
            <div v-if="!improvementRows.length" class="rounded-sm ring-1 ring-default bg-elevated/40 px-4 py-6 text-center text-sm text-dimmed">
              No improvements detected.
            </div>
            <div v-else class="rounded-sm ring-1 ring-default bg-elevated/40 overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-elevated/60 text-xs text-dimmed">
                  <tr>
                    <th class="text-left font-medium px-3 py-2">
                      Route
                    </th>
                    <th class="text-left font-medium px-3 py-2">
                      Metric
                    </th>
                    <th class="text-right font-medium px-3 py-2">
                      Base
                    </th>
                    <th class="text-right font-medium px-3 py-2">
                      Current
                    </th>
                    <th class="text-right font-medium px-3 py-2">
                      Δ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in improvementRows" :key="`i-${row.url}-${row.device}-${row.metric}`">
                    <tr
                      class="border-t border-default hover:bg-elevated/60 cursor-pointer transition-colors"
                      @click="toggleRow(row)"
                    >
                      <td class="px-3 py-2 max-w-0">
                        <div class="flex items-center gap-1.5">
                          <UIcon
                            name="i-heroicons-chevron-right"
                            class="size-3 text-dimmed transition-transform shrink-0"
                            :class="{ 'rotate-90': isExpanded(row) }"
                          />
                          <span class="font-mono text-xs truncate" :title="row.url">{{ row.path }}</span>
                          <span class="text-[10px] text-dimmed shrink-0">({{ row.device }})</span>
                        </div>
                      </td>
                      <td class="px-3 py-2 text-muted text-xs whitespace-nowrap">
                        {{ metricLabel(row.metric) }}
                      </td>
                      <td class="px-3 py-2 text-right text-muted">
                        {{ fmtVal(row.base, row.isScore) }}
                      </td>
                      <td class="px-3 py-2 text-right text-highlighted">
                        {{ fmtVal(row.current, row.isScore) }}
                      </td>
                      <td class="px-3 py-2 text-right text-success font-medium whitespace-nowrap">
                        {{ fmtDelta(row.delta, row.isScore) }}
                      </td>
                    </tr>
                    <tr v-if="isExpanded(row)" class="border-t border-default bg-default/40">
                      <td colspan="5" class="px-3 py-2">
                        <div class="text-[11px] text-dimmed uppercase tracking-widest mb-1.5">
                          All changes for this route
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div v-for="d in routeDetails(row)" :key="`d-${d.metric}`" class="flex items-center justify-between gap-2">
                            <span class="text-muted">{{ metricLabel(d.metric) }}</span>
                            <span :class="d.delta > 0 === d.isScore ? 'text-success' : 'text-error'" class="font-mono">
                              {{ fmtVal(d.base, d.isScore) }} → {{ fmtVal(d.current, d.isScore) }}
                              ({{ fmtDelta(d.delta, d.isScore) }})
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </template>
    </template>
  </div>
</template>
