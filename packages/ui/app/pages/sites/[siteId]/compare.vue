<script setup lang="ts">
import type { CompareRouteRow } from '@unlighthouse/contracts'
import type { UiTableColumn } from '#layers/design-system/app/utils/ui-table'
import { useMediaQuery } from '@vueuse/core'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import {
  CATEGORY_METRICS,
  createComparePresentation,
  CWV_METRICS,
  cwvVerdictColor,
  deltaClass,
  DIAGNOSTIC_METRICS,
  fmtCwvP75,
  compareRowKey as rowKey,
  SHORT_LABEL,
  SORT_OPTIONS as sortOptions,
  statusBadge,
} from '~/features/compare/presentation'
import { comparisonRouteSetNotice } from '~/features/compare/state'
import { useCompareWorkflow } from '~/features/compare/workflow'
import { deviceLabelForScan } from '~/features/sites/scan-pairs'

definePageMeta({ layout: 'compare' })

const { scoreToColor } = createScoreColorHelpers()
const { fmtScore, fmtDelta, fmtMetric, fmtTimestamp: fmtDate, fmtBytes } = createFormatters()
const isMobile = useMediaQuery('(max-width: 767px)')
const {
  siteId,
  currentScanId,
  baseScanId,
  currentMeta,
  currentMetaError,
  currentMetaStatus,
  refreshCurrentMeta,
  baseMeta,
  baseMetaError,
  baseMetaStatus,
  refreshBaseMeta,
  historyError,
  historyStatus,
  refreshHistory,
  otherScans,
  currentScans,
  comparing,
  requestState,
  compareError,
  packError,
  pairCompatibility,
  statusFilter,
  deviceFilter,
  urlFilter,
  page,
  sortKey,
  selectedRowKey,
  thresholds,
  report,
  copyingMarkdown,
  copyingLink,
  showLegacyMetrics,
  showPackDetails,
  copyAsMarkdown,
  copyLink,
  cwvP75Rows,
  otherPackChanges,
  handleCompare,
  retryComparison,
  retryPacks,
  swapDirection,
  onFilterInput,
  clearFilters,
  hasMultipleDevices,
  selectedRow,
  totalPages,
  verdict,
  shortId,
  gotoOverview,
} = useCompareWorkflow()

const routeSetNotice = computed(() => report.value ? comparisonRouteSetNotice(report.value.summary) : null)
const hasActiveFilters = computed(() => statusFilter.value !== 'all' || deviceFilter.value !== '' || urlFilter.value !== '' || sortKey.value !== 'delta-perf-desc')
const pairHasPartialDeviceOverlap = computed(() => pairCompatibility.value._tag === 'ready'
  && (pairCompatibility.value.baseOnlyDevices.length > 0 || pairCompatibility.value.currentOnlyDevices.length > 0))
const sharedDeviceLabel = computed(() => pairCompatibility.value._tag === 'ready'
  ? pairCompatibility.value.sharedDevices.map(device => device === 'mobile' ? 'Mobile' : 'Desktop').join(' and ')
  : '')

usePageTitle(computed(() => {
  const siteTitle = formatTitleSite(currentMeta.value?.site)
  return siteTitle ? `Compare Scans - ${siteTitle}` : 'Compare Scans'
}))

const { deltaClassWithThreshold, rowScoreCell } = createComparePresentation({
  thresholds,
  fmtScore,
  fmtDelta,
})

// Route delta table columns. Server-sorted (via the sort Select), so
// columns disable client sorting. Alignment/widths ride on the column defs;
// score cells reuse rowScoreCell() for threshold-aware colour. UiTable pins
// its own header, so columns don't carry sticky classes.
const IconCmp = resolveComponent('UiIcon')
const UiStatusBadgeCmp = resolveComponent('UiStatusBadge')

// Shared tone→semantic translation: route-status badges (via statusBadge)
// and the summary verdict chip (workflow's own tone literal) both speak the
// legacy shadcn tone vocabulary, so one mapping covers both.
function toneSemantic(tone: string): SemanticStatus {
  switch (tone) {
    case 'destructive': return 'error'
    case 'default': return 'success'
    case 'secondary': return 'info'
    default: return 'neutral'
  }
}

function compareStatusSemantic(status: string): SemanticStatus {
  return toneSemantic(statusBadge(status))
}

const compareColumns = computed<UiTableColumn<CompareRouteRow>[]>(() => {
  const cols: UiTableColumn<CompareRouteRow>[] = [
    {
      id: 'path',
      header: 'Path',
      enableSorting: false,
      meta: { headClass: 'min-w-[200px]', cellClass: 'font-mono text-xs' },
      cell: ({ row }) => h('span', {
        'class': 'block truncate max-w-[400px]',
        'aria-label': `Route ${row.original.url}`,
      }, row.original.path),
    },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      meta: { headClass: 'w-20' },
      cell: ({ row }) => h(UiStatusBadgeCmp, { status: compareStatusSemantic(row.original.status), label: row.original.status, class: 'capitalize' }),
    },
  ]
  if (hasMultipleDevices.value) {
    cols.push({
      id: 'device',
      header: 'Dev',
      enableSorting: false,
      meta: { align: 'center', headClass: 'w-24' },
      cell: ({ row }) => h('span', { class: 'inline-flex items-center gap-1 text-xs text-muted' }, [
        h(IconCmp, {
          name: row.original.device === 'mobile' ? 'smartphone' : 'monitor',
          class: 'size-3.5',
        }),
        row.original.device === 'mobile' ? 'Mobile' : 'Desktop',
      ]),
    })
  }
  for (const m of CATEGORY_METRICS) {
    cols.push({
      id: m.key,
      header: SHORT_LABEL[m.key] ?? m.label,
      enableSorting: false,
      meta: { align: 'right', headClass: 'w-16' },
      cell: ({ row }) => {
        const c = rowScoreCell(row.original, m.key, m.thresholdKey)
        return h('span', { class: ['tabular-nums text-xs', c.klass] }, [
          c.value,
          c.mutedByThreshold ? h('span', { class: 'sr-only' }, ' (inside the noise threshold)') : null,
        ])
      },
    })
  }
  return cols
})
</script>

<template>
  <div class="h-full flex flex-col overflow-y-auto md:overflow-hidden">
    <h1 class="sr-only">
      Compare scans
    </h1>
    <!-- Couldn't load the current scan — the compare can't proceed, so
         surface it above the toolbar with a retry. -->
    <QueryError v-if="currentMetaError" :error="currentMetaError" :on-retry="refreshCurrentMeta" class="m-4" />
    <QueryError v-if="baseMetaError" :error="baseMetaError" :on-retry="refreshBaseMeta" retry-label="Retry base scan" class="m-4" />
    <QueryError v-if="historyError" :error="historyError" :on-retry="refreshHistory" retry-label="Retry scan history" class="m-4" />

    <!-- Base → Current is one directional control, followed by its tools. -->
    <div class="border-b bg-default/50 p-3">
      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <section aria-labelledby="compare-direction-title" class="min-w-0 rounded-lg border border-default bg-elevated/30 p-3">
          <div class="grid min-w-0 grid-cols-1 items-end gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div class="min-w-0">
              <div class="mb-1.5 flex items-center justify-between gap-2">
                <label for="compare-base-scan" class="text-label text-muted">Base</label>
                <span class="text-xs text-muted">Before</span>
              </div>
              <USelect
                id="compare-base-scan"
                v-model="baseScanId"
                aria-label="Base scan"
                :items="otherScans.map(s => ({ value: s.scanId, label: `${shortId(s.scanId)} · ${deviceLabelForScan(s)}`, scan: s }))"
                placeholder="Select base scan"
                size="sm"
                class="min-h-11 w-full min-w-0 sm:min-h-8"
              >
                <template #item="{ item }">
                  <div class="flex min-w-0 items-center gap-2 text-xs">
                    <span class="font-mono">{{ shortId(item.scan.scanId) }}</span>
                    <UiChip purpose="count">
                      {{ deviceLabelForScan(item.scan) }}
                    </UiChip>
                    <span class="truncate text-muted">{{ fmtDate(item.scan.completedAt || item.scan.startedAt) }}</span>
                  </div>
                </template>
              </USelect>
              <button v-if="baseMeta" type="button" class="mt-1 inline-flex min-h-11 max-w-full items-center gap-1 text-left text-xs text-muted hover:text-default hover:underline sm:min-h-6" @click="gotoOverview(baseScanId)">
                <UiIcon name="external" class="size-3 shrink-0" aria-hidden="true" />
                <span class="truncate">{{ fmtDate(baseMeta.completedAt || baseMeta.startedAt) }}</span>
                <span v-if="baseMeta.ciCommit" class="shrink-0 font-mono">· {{ baseMeta.ciCommit.slice(0, 7) }}</span>
              </button>
            </div>

            <UiButton purpose="secondary" size="sm" block icon="compare" :disabled="!baseScanId || !currentScanId" @click="swapDirection">
              Swap
            </UiButton>

            <div class="min-w-0">
              <div class="mb-1.5 flex items-center justify-between gap-2">
                <label for="compare-current-scan" class="text-label text-muted">Current</label>
                <span class="text-xs text-muted">After</span>
              </div>
              <USelect
                id="compare-current-scan"
                v-model="currentScanId"
                aria-label="Current scan"
                :items="currentScans.map(s => ({ value: s.scanId, label: `${shortId(s.scanId)} · ${deviceLabelForScan(s)}`, scan: s }))"
                placeholder="Select current scan"
                size="sm"
                class="min-h-11 w-full min-w-0 sm:min-h-8"
              >
                <template #item="{ item }">
                  <div class="flex min-w-0 items-center gap-2 text-xs">
                    <span class="font-mono">{{ shortId(item.scan.scanId) }}</span>
                    <UiChip purpose="count">
                      {{ deviceLabelForScan(item.scan) }}
                    </UiChip>
                    <span class="truncate text-muted">{{ fmtDate(item.scan.completedAt || item.scan.startedAt) }}</span>
                  </div>
                </template>
              </USelect>
              <button v-if="currentMeta" type="button" class="mt-1 inline-flex min-h-11 max-w-full items-center gap-1 text-left text-xs text-muted hover:text-default hover:underline sm:min-h-6" @click="gotoOverview(currentScanId)">
                <UiIcon name="external" class="size-3 shrink-0" aria-hidden="true" />
                <span class="truncate">{{ fmtDate(currentMeta.completedAt || currentMeta.startedAt) }}</span>
                <span v-if="currentMeta.ciCommit" class="shrink-0 font-mono">· {{ currentMeta.ciCommit.slice(0, 7) }}</span>
              </button>
            </div>
          </div>

          <div id="compare-direction-title" class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-default pt-2 text-xs">
            <strong class="font-medium text-default">Current − Base</strong>
            <span class="text-muted">Higher scores improve; lower timings and CLS improve.</span>
            <span class="inline-flex items-center gap-1 text-success"><span aria-hidden="true">↑</span> score or <span aria-hidden="true">↓</span> timing = improved</span>
            <span class="inline-flex items-center gap-1 text-error"><span aria-hidden="true">↓</span> score or <span aria-hidden="true">↑</span> timing = regressed</span>
          </div>
        </section>

        <div class="grid grid-cols-2 content-start gap-2" aria-label="Comparison tools">
          <UiPopover>
            <UiButton purpose="secondary" size="sm" block icon="sliders">
              Thresholds
            </UiButton>
            <template #panel>
              <div class="w-[min(24rem,calc(100vw-2rem))] space-y-3 p-4">
                <div>
                  <h2 class="text-sm font-semibold">
                    Regression thresholds
                  </h2>
                  <p class="text-xs text-muted">
                    Empty uses CI defaults. Deltas inside a threshold render as noise.
                  </p>
                </div>

                <UiAlert status="warning" icon="info">
                  CWV is noisy on parallel single-sample runs. Run with <code class="code-inline text-xs">--samples 3</code> for stability, or widen these thresholds.
                </UiAlert>

                <div class="space-y-3 text-xs">
                  <div>
                    <div class="text-label mb-1.5 text-muted">
                      Category scores (0–1)
                    </div>
                    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label class="space-y-1"><span class="text-muted">Performance</span><UInput v-model="thresholds.performance" name="threshold-performance" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.05" size="xs" class="min-h-11 w-full sm:min-h-8" /></label>
                      <label class="space-y-1"><span class="text-muted">Accessibility</span><UInput v-model="thresholds.accessibility" name="threshold-accessibility" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.05" size="xs" class="min-h-11 w-full sm:min-h-8" /></label>
                      <label class="space-y-1"><span class="text-muted">SEO</span><UInput v-model="thresholds.seo" name="threshold-seo" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.05" size="xs" class="min-h-11 w-full sm:min-h-8" /></label>
                      <label class="space-y-1"><span class="text-muted">Best Practices</span><UInput v-model="thresholds['best-practices']" name="threshold-best-practices" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.05" size="xs" class="min-h-11 w-full sm:min-h-8" /></label>
                      <label class="space-y-1"><span class="text-muted">Agentic</span><UInput v-model="thresholds['agentic-browsing']" name="threshold-agentic-browsing" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.05" size="xs" class="min-h-11 w-full sm:min-h-8" /></label>
                    </div>
                  </div>

                  <div>
                    <div class="text-label mb-1.5 text-muted">
                      Core Web Vitals
                    </div>
                    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label class="space-y-1"><span class="flex justify-between text-muted">LCP (ms)<span class="italic text-muted/70">≈ 300ms noise</span></span><UInput v-model="thresholds.lcp" name="threshold-lcp" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="500" size="xs" class="min-h-11 w-full sm:min-h-8" /></label>
                      <label class="space-y-1"><span class="flex justify-between text-muted">CLS<span class="italic text-muted/70">≈ 0.02 noise</span></span><UInput v-model="thresholds.cls" name="threshold-cls" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.1" size="xs" class="min-h-11 w-full sm:min-h-8" /></label>
                      <label class="space-y-1"><span class="flex justify-between text-muted">INP (ms)<span class="italic text-muted/70">≈ 100ms noise</span></span><UInput v-model="thresholds.inp" name="threshold-inp" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="200" size="xs" class="min-h-11 w-full sm:min-h-8" /></label>
                    </div>
                  </div>
                </div>

                <UiButton purpose="cta" size="sm" block :disabled="pairCompatibility._tag !== 'ready'" @click="handleCompare">
                  Apply thresholds
                </UiButton>
              </div>
            </template>
          </UiPopover>

          <UiButton purpose="secondary" size="sm" block :loading="copyingLink" :disabled="copyingLink || !currentScanId" icon="link" @click="copyLink">
            Copy link
          </UiButton>
          <UiButton purpose="secondary" size="sm" block :loading="copyingMarkdown" :disabled="copyingMarkdown || !report" icon="copy" @click="copyAsMarkdown">
            Copy markdown
          </UiButton>
          <UiButton purpose="cta" size="sm" block :loading="comparing" :disabled="pairCompatibility._tag !== 'ready' || comparing" icon="refresh" @click="handleCompare">
            Compare scans
          </UiButton>
        </div>
      </div>
    </div>

    <div v-if="pairCompatibility._tag === 'missing-current'" class="flex-1 overflow-auto p-4">
      <div v-if="historyStatus === 'pending'" class="flex min-h-64 items-center justify-center gap-3 text-sm text-muted" role="status">
        <UiIcon name="loading" class="size-5 animate-spin" aria-hidden="true" />
        Loading completed scans…
      </div>
      <UiEmptyState v-else icon="radar" title="Run a scan to create the current result" description="Compare needs a completed current scan before it can find a baseline.">
        <UiButton purpose="cta" :to="{ path: '/scan/new' }" icon="radar">
          Run first scan
        </UiButton>
      </UiEmptyState>
    </div>

    <div v-else-if="pairCompatibility._tag === 'missing-base'" class="flex-1 overflow-auto p-4">
      <UiEmptyState icon="compare" :title="otherScans.length ? 'Choose a Base scan' : 'Run one more scan to create a baseline'" :description="otherScans.length ? 'Choose a Base scan above. Current stays on the right side of the comparison.' : 'This site has one completed scan. Run it again, then compare the earlier Base with the newer Current result.'">
        <UiButton v-if="!otherScans.length" purpose="cta" :to="{ path: '/scan/new', query: { url: currentMeta?.site } }" icon="radar">
          Run another scan
        </UiButton>
      </UiEmptyState>
    </div>

    <div v-else-if="pairCompatibility._tag === 'same-scan'" class="flex-1 overflow-auto p-4">
      <UiAlert status="warning" title="Choose two different scans" description="Base and Current point to the same scan. Choose another result in either selector to produce a meaningful delta." />
    </div>

    <div v-else-if="pairCompatibility._tag === 'different-site'" class="flex-1 overflow-auto p-4">
      <UiAlert status="error" title="Scans belong to different sites" description="Base and Current must share the same origin. Choose both scans from this site's completed history." />
    </div>

    <div v-else-if="pairCompatibility._tag === 'no-shared-device'" class="flex-1 overflow-auto p-4">
      <UiAlert
        status="warning"
        title="Scans have no shared device"
        :description="`Base contains ${pairCompatibility.baseDevices.join(', ')}; Current contains ${pairCompatibility.currentDevices.join(', ')}. Choose scans with Mobile or Desktop in common.`"
      />
    </div>

    <div v-else-if="pairCompatibility._tag === 'loading-metadata'" class="flex-1 overflow-auto p-4">
      <div v-if="currentMetaStatus === 'pending' || baseMetaStatus === 'pending'" class="mx-auto max-w-3xl space-y-4 py-12" role="status" aria-label="Loading scan metadata">
        <div class="flex items-center justify-center gap-3 text-sm text-muted">
          <UiIcon name="loading" class="size-5 animate-spin" aria-hidden="true" />
          Loading scan metadata…
        </div>
        <UiSkeleton class="h-16 w-full" />
        <UiSkeleton class="h-48 w-full" />
      </div>
    </div>

    <div v-else-if="compareError && !report" class="flex-1 overflow-auto p-4">
      <QueryError :error="compareError" :on-retry="retryComparison" retry-label="Retry comparison" />
    </div>

    <!-- Initial and explicit comparison loading. -->
    <div v-else-if="comparing && !report" class="flex-1 overflow-auto p-4">
      <div class="mx-auto max-w-4xl space-y-4 py-10" role="status" aria-live="polite" aria-label="Comparing route metrics">
        <div class="flex items-center justify-center gap-3 text-sm font-medium">
          <UiIcon name="loading" class="size-5 animate-spin text-muted" aria-hidden="true" />
          Comparing route metrics…
        </div>
        <UiSkeleton class="h-12 w-full" />
        <div class="grid gap-3 md:grid-cols-2">
          <UiSkeleton class="h-52 w-full" />
          <UiSkeleton class="h-52 w-full" />
        </div>
      </div>
    </div>

    <div v-else-if="!report" class="flex-1 overflow-auto p-4">
      <UiEmptyState icon="compare" title="Compare Base with Current" description="Choose compatible scans above, then run the comparison." compact>
        <UiButton purpose="cta" :disabled="pairCompatibility._tag !== 'ready'" @click="handleCompare">
          Compare scans
        </UiButton>
      </UiEmptyState>
    </div>

    <!-- Report body -->
    <template v-else-if="report">
      <div v-if="comparing" class="flex items-center gap-2 border-b border-default px-4 py-2 text-xs text-muted" role="status" aria-live="polite">
        <UiIcon name="loading" class="size-3.5 animate-spin" aria-hidden="true" />
        Updating comparison…
      </div>
      <QueryError v-if="compareError" :error="compareError" :on-retry="retryComparison" retry-label="Retry comparison" class="m-4" />
      <UiAlert
        v-if="requestState._tag === 'partial' && packError"
        status="warning"
        title="Route comparison ready; pack summaries unavailable"
        :description="`${packError.message} Route-level results remain usable. Retry the summary request when the backend is available.`"
        class="m-4"
      >
        <template #action>
          <UiButton purpose="secondary" size="xs" @click="retryPacks">
            Retry summaries
          </UiButton>
        </template>
      </UiAlert>
      <UiAlert
        v-if="pairHasPartialDeviceOverlap"
        status="info"
        title="Device scope differs"
        :description="`${sharedDeviceLabel} exists in both scans. Entries from devices present on only one side can appear added or removed; filter to ${sharedDeviceLabel} for like-for-like route evidence.`"
        class="m-4"
      />

      <!-- Summary band -->
      <div class="px-4 py-3 border-b flex items-center gap-6 flex-wrap">
        <span class="text-label text-muted">Full-scan summary</span>
        <UiChip v-if="verdict" purpose="status" :status="toneSemantic(verdict.tone)" size="sm" class="!bg-transparent ring-1 ring-inset ring-current/20">
          {{ verdict.text }}
        </UiChip>
        <div class="flex flex-wrap items-center gap-4 text-xs">
          <div class="flex items-center gap-1.5">
            <span class="text-muted">Total</span>
            <span class="numerals-display">{{ report.summary.totalRoutes }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-muted">Regressed</span>
            <span class="numerals-display text-error">{{ report.summary.regressedRoutes }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-muted">Improved</span>
            <span class="numerals-display text-success">{{ report.summary.improvedRoutes }}</span>
          </div>
          <div v-if="report.summary.addedRoutes" class="flex items-center gap-1.5">
            <span class="text-muted">Added</span>
            <span class="numerals-display text-info">{{ report.summary.addedRoutes }}</span>
          </div>
          <div v-if="report.summary.removedRoutes" class="flex items-center gap-1.5">
            <span class="text-muted">Removed</span>
            <span class="numerals-display text-warning">{{ report.summary.removedRoutes }}</span>
          </div>
          <div class="flex items-center gap-1.5 border-l pl-4">
            <span class="text-muted">Avg score Current − Base</span>
            <span class="numerals-display" :class="(report.summary.avgScoreDelta ?? 0) >= 0 ? 'text-success' : 'text-error'">
              {{ fmtDelta(report.summary.avgScoreDelta, true) }}
            </span>
          </div>
        </div>

        <!-- Category strip — inline, compact -->
        <div v-if="report.summary.categoryDeltas?.length" class="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs max-sm:w-full max-sm:justify-start">
          <div v-for="cd in report.summary.categoryDeltas" :key="cd.category" class="flex items-center gap-1">
            <span class="text-muted">{{ cd.label }}</span>
            <span class="tabular-nums" :class="cd.base != null ? scoreToColor(cd.base) : 'text-muted'">{{ fmtScore(cd.base) }}</span>
            <UiIcon name="next" class="size-2.5 text-muted/40" />
            <span class="tabular-nums" :class="cd.current != null ? scoreToColor(cd.current) : 'text-muted'">{{ fmtScore(cd.current) }}</span>
            <span class="numerals-display" :class="deltaClass(cd.delta, true)">{{ fmtDelta(cd.delta, true) }}</span>
          </div>
        </div>
      </div>

      <UiAlert
        v-if="routeSetNotice"
        status="warning"
        icon="info"
        title="URL or device set changed"
        :description="routeSetNotice"
        class="mx-4 my-3"
      />

      <!-- Core Web Vitals p75 strip — the smoothed answer to the noisy
           per-route CWV columns below. Sourced from the cwv pack
           (aggregates across routes). Hidden when the pack didn't
           run on either scan. -->
      <div v-if="cwvP75Rows.length" class="px-4 py-2 border-b bg-default/30 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
        <span class="text-label text-muted shrink-0">
          Web Vitals p75
        </span>
        <div v-for="row in cwvP75Rows" :key="row.metric" class="flex items-center gap-1.5">
          <span class="font-medium uppercase text-xs">{{ row.label }}</span>
          <span class="tabular-nums">{{ fmtCwvP75(row.metric, row.baseP75) }}</span>
          <UiIcon name="next" class="size-2.5 text-muted/40" />
          <span class="tabular-nums font-medium" :class="cwvVerdictColor(row.verdict)">{{ fmtCwvP75(row.metric, row.currentP75) }}</span>
          <span
            v-if="row.delta != null"
            class="text-xs tabular-nums"
            :class="deltaClassWithThreshold(row.delta, false, row.metric).klass"
          >
            ({{ fmtDelta(row.delta, false, row.metric) }})
            <span v-if="deltaClassWithThreshold(row.delta, false, row.metric).mutedByThreshold" class="sr-only"> inside the noise threshold</span>
          </span>
        </div>
        <span class="ml-auto text-xs text-muted italic">
          smoothed across routes
          <span class="sr-only">; this aggregate is less noisy than per-route single-sample values</span>
        </span>
      </div>

      <!-- Filter bar -->
      <div class="px-4 py-2 border-b flex items-center gap-3 flex-wrap">
        <span class="text-label w-full text-muted sm:w-auto">Route changes</span>
        <div class="relative w-full sm:w-64">
          <UiIcon name="search" class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted pointer-events-none" />
          <UInput name="compare-route-filter" type="search" autocomplete="off" aria-label="Filter routes by URL or path" placeholder="Filter by URL or path…" size="sm" class="min-h-11 w-full sm:min-h-8" :model-value="urlFilter" :ui="{ base: 'pl-8' }" @update:model-value="onFilterInput" />
        </div>

        <USelect
          v-if="isMobile"
          v-model="statusFilter"
          :items="[
            { value: 'all', label: 'All changes' },
            { value: 'changed', label: 'Changed' },
            { value: 'regressed', label: 'Regressed' },
            { value: 'improved', label: 'Improved' },
            { value: 'added', label: 'Added' },
            { value: 'removed', label: 'Removed' },
          ]"
          aria-label="Filter routes by change status"
          size="sm"
          class="min-h-11 w-full sm:min-h-8"
        />
        <div v-else class="max-w-full overflow-x-auto">
          <UTabs
            v-model="statusFilter"
            :content="false"
            size="sm"
            :items="[
              { value: 'all', label: 'All' },
              { value: 'changed', label: 'Changed' },
              { value: 'regressed', label: 'Regressed' },
              { value: 'improved', label: 'Improved' },
              { value: 'added', label: 'Added' },
              { value: 'removed', label: 'Removed' },
            ]"
          />
        </div>

        <USelect
          v-if="hasMultipleDevices && isMobile"
          v-model="deviceFilter"
          :items="[
            { value: '', label: 'All devices' },
            { value: 'mobile', label: 'Mobile', icon: 'smartphone' },
            { value: 'desktop', label: 'Desktop', icon: 'monitor' },
          ]"
          aria-label="Filter routes by device"
          size="sm"
          class="min-h-11 w-full sm:min-h-8"
        />

        <UTabs
          v-else-if="hasMultipleDevices"
          v-model="deviceFilter"
          :content="false"
          size="sm"
          :items="[
            { value: '', label: 'All' },
            { value: 'mobile', label: 'Mobile', icon: 'smartphone' },
            { value: 'desktop', label: 'Desktop', icon: 'monitor' },
          ]"
        />

        <USelect v-model="sortKey" :items="sortOptions" aria-label="Sort routes" size="sm" class="min-h-11 w-full sm:min-h-8 sm:w-44" />

        <span class="ml-auto text-xs text-muted tabular-nums">
          {{ report.routes.total }} route{{ report.routes.total === 1 ? '' : 's' }}
        </span>
      </div>

      <!-- Pack changes — the aggregated layer above raw per-route numbers.
           Each pack (images, a11y-quick-wins, cwv, ...) emits its own
           report; we diff base vs current and surface anything that
           moved. cwv handled separately above as the headline; this
           lists the rest. Collapsed by default to keep the route
           table the primary surface. -->
      <div v-if="otherPackChanges.length" class="border-b">
        <button
          type="button"
          class="px-4 py-2 w-full flex items-center gap-2 hover:bg-elevated/30 transition-colors text-xs"
          :aria-expanded="showPackDetails"
          aria-controls="compare-pack-details"
          @click="showPackDetails = !showPackDetails"
        >
          <UiIcon name="chevron-right" class="size-3.5 text-muted transition-transform" :class="{ 'rotate-90': showPackDetails }" />
          <span class="font-medium">{{ otherPackChanges.length }} pack{{ otherPackChanges.length === 1 ? '' : 's' }} changed</span>
          <span class="text-muted text-xs">
            {{ otherPackChanges.map(p => p.packName).join(', ') }}
          </span>
          <span class="ml-auto text-xs text-muted italic">{{ showPackDetails ? 'expanded' : 'collapsed' }}</span>
        </button>
        <div v-if="showPackDetails" id="compare-pack-details" class="px-4 py-3 bg-default/20 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="pack in otherPackChanges" :key="pack.packName" class="rounded-lg border bg-default p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium capitalize">{{ pack.packName.replace(/-/g, ' ') }}</span>
              <span class="text-xs text-muted">{{ pack.base ? 'changed' : 'new' }}</span>
            </div>
            <!-- Render whatever summary fields the pack-agnostic
                 summariser surfaced. Nullable so packs that don't
                 expose findings / severity counts simply hide rows. -->
            <div class="text-xs space-y-0.5">
              <div v-if="pack.baseSummary?.findings != null || pack.currentSummary?.findings != null" class="flex justify-between">
                <span class="text-muted">Findings</span>
                <span class="tabular-nums">
                  {{ pack.baseSummary?.findings ?? '—' }}
                  <UiIcon name="next" class="size-2.5 inline mx-0.5 text-muted/40" />
                  <span :class="(pack.currentSummary?.findings ?? 0) > (pack.baseSummary?.findings ?? 0) ? 'text-error' : (pack.currentSummary?.findings ?? 0) < (pack.baseSummary?.findings ?? 0) ? 'text-success' : ''">
                    {{ pack.currentSummary?.findings ?? '—' }}
                  </span>
                </span>
              </div>
              <div v-if="(pack.baseSummary?.critical ?? 0) || (pack.currentSummary?.critical ?? 0)" class="flex justify-between">
                <span class="text-muted">Critical</span>
                <span class="tabular-nums">{{ pack.baseSummary?.critical ?? 0 }} → <span :class="(pack.currentSummary?.critical ?? 0) > (pack.baseSummary?.critical ?? 0) ? 'text-error' : 'text-success'">{{ pack.currentSummary?.critical ?? 0 }}</span></span>
              </div>
              <div v-if="(pack.baseSummary?.serious ?? 0) || (pack.currentSummary?.serious ?? 0)" class="flex justify-between">
                <span class="text-muted">Serious</span>
                <span class="tabular-nums">{{ pack.baseSummary?.serious ?? 0 }} → <span :class="(pack.currentSummary?.serious ?? 0) > (pack.baseSummary?.serious ?? 0) ? 'text-error' : 'text-success'">{{ pack.currentSummary?.serious ?? 0 }}</span></span>
              </div>
              <div v-if="(pack.baseSummary?.totalBytesSavable ?? 0) || (pack.currentSummary?.totalBytesSavable ?? 0)" class="flex justify-between">
                <span class="text-muted">Wasted bytes</span>
                <span class="tabular-nums">
                  {{ fmtBytes(pack.baseSummary?.totalBytesSavable ?? 0) }}
                  <UiIcon name="next" class="size-2.5 inline mx-0.5 text-muted/40" />
                  <span :class="(pack.currentSummary?.totalBytesSavable ?? 0) > (pack.baseSummary?.totalBytesSavable ?? 0) ? 'text-error' : 'text-success'">
                    {{ fmtBytes(pack.currentSummary?.totalBytesSavable ?? 0) }}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Main split: table left, detail right -->
      <SplitterGroup :direction="isMobile ? 'vertical' : 'horizontal'" class="flex-1 min-h-0 min-w-0 overflow-hidden max-md:h-[70vh] max-md:flex-none">
        <SplitterPanel :default-size="62" :min-size="35" class="min-w-0">
          <div class="h-full overflow-auto">
            <UiTable
              :columns="compareColumns"
              :data="report.routes.items"
              :row-id="(r) => rowKey(r)"
              row-clickable
              disable-pagination
              :row-class="(r) => selectedRowKey === rowKey(r) ? 'bg-elevated' : ''"
              @row-click="(r) => { selectedRowKey = rowKey(r) }"
            >
              <template #empty-component>
                <div class="flex min-h-48 flex-col items-center justify-center gap-3 px-4 text-center">
                  <div>
                    <p class="font-medium text-default">
                      No routes match these filters
                    </p>
                    <p class="mt-1 text-sm text-muted">
                      Clear filters to restore all route changes for this scan pair.
                    </p>
                  </div>
                  <UiButton v-if="hasActiveFilters" purpose="secondary" size="sm" @click="clearFilters">
                    Clear filters
                  </UiButton>
                </div>
              </template>
            </UiTable>

            <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-2 border-t sticky bottom-0 bg-default">
              <span class="text-xs text-muted">Page {{ page }} of {{ totalPages }}</span>
              <div class="flex gap-1">
                <UiButton purpose="secondary" size="sm" :disabled="page <= 1" icon="chevron-left" aria-label="Go to previous page" @click="page--" />
                <UiButton purpose="secondary" size="sm" :disabled="page >= totalPages" icon="chevron-right" aria-label="Go to next page" @click="page++" />
              </div>
            </div>
          </div>
        </SplitterPanel>

        <SplitterResizeHandle
          class="bg-[var(--ui-border)]/40 hover:bg-accented transition-colors data-[state=drag]:bg-inverted/60"
          :class="isMobile ? 'h-1.5 w-full' : 'w-1.5'"
        />

        <SplitterPanel :default-size="38" :min-size="25" class="min-w-0">
          <div v-if="selectedRow" class="h-full overflow-auto p-4 space-y-4">
            <div>
              <h2 class="font-mono text-sm font-medium break-all">
                {{ selectedRow.url }}
              </h2>
              <div class="flex items-center gap-2 mt-1">
                <UiChip purpose="count">
                  {{ selectedRow.device }}
                </UiChip>
                <UiStatusBadge :status="compareStatusSemantic(selectedRow.status)" :label="selectedRow.status" class="capitalize" />
                <NuxtLink
                  :to="`/sites/${siteId}/scans/${currentScanId}/route/${encodeURIComponent(selectedRow.path)}`"
                  class="text-xs text-muted hover:text-default inline-flex items-center gap-1"
                >
                  <UiIcon name="external" class="size-2.5" />
                  Open route detail
                </NuxtLink>
              </div>
            </div>

            <!-- Categories: the headline. Aggregate of dozens of audits,
                 noise-resistant. -->
            <section>
              <h3 class="text-label text-muted mb-2">
                Categories
              </h3>
              <UiTableShell bordered label="Category metric comparison">
                <template #head>
                  <UiTableTh>Metric</UiTableTh>
                  <UiTableTh align="right">
                    Base
                  </UiTableTh>
                  <UiTableTh align="right">
                    Current
                  </UiTableTh>
                  <UiTableTh align="right">
                    Delta
                  </UiTableTh>
                </template>
                <tr v-for="m in CATEGORY_METRICS" :key="m.key" class="border-b border-default last:border-0">
                  <UiTableTd class="font-medium">
                    {{ m.label }}
                  </UiTableTd>
                  <UiTableTd align="right" class="tabular-nums">
                    {{ fmtMetric(selectedRow.base?.[m.key] ?? null, m.score, m.key) }}
                  </UiTableTd>
                  <UiTableTd align="right" class="tabular-nums">
                    {{ fmtMetric(selectedRow.current?.[m.key] ?? null, m.score, m.key) }}
                  </UiTableTd>
                  <UiTableTd
                    align="right"
                    class="tabular-nums font-medium"
                    :class="deltaClassWithThreshold(selectedRow.deltas?.[m.key], m.score, m.thresholdKey).klass"
                  >
                    {{ fmtDelta(selectedRow.deltas?.[m.key], m.score, m.key) }}
                    <span v-if="deltaClassWithThreshold(selectedRow.deltas?.[m.key], m.score, m.thresholdKey).mutedByThreshold" class="sr-only"> inside the noise threshold</span>
                  </UiTableTd>
                </tr>
              </UiTableShell>
            </section>

            <!-- Core Web Vitals — Google's stable real-user metrics. -->
            <section>
              <h3 class="text-label text-muted mb-2 flex items-center gap-1.5">
                Core Web Vitals
                <UiTooltip text="Lab values can be noisy on parallel-device single-sample runs. Use --samples 3 for stability." trigger-as="button">
                  <UiIcon name="info" class="size-2.5 opacity-60" />
                </UiTooltip>
              </h3>
              <UiTableShell bordered label="Core Web Vitals comparison">
                <tr v-for="m in CWV_METRICS" :key="m.key" class="border-b border-default last:border-0">
                  <UiTableTd class="font-medium">
                    <UiTooltip :text="m.hint" trigger-as="button">
                      <span>{{ m.label }}</span>
                    </UiTooltip>
                  </UiTableTd>
                  <UiTableTd align="right" class="tabular-nums">
                    {{ fmtMetric(selectedRow.base?.[m.key] ?? null, m.score, m.key) }}
                  </UiTableTd>
                  <UiTableTd align="right" class="tabular-nums">
                    {{ fmtMetric(selectedRow.current?.[m.key] ?? null, m.score, m.key) }}
                  </UiTableTd>
                  <UiTableTd
                    align="right"
                    class="tabular-nums font-medium"
                    :class="deltaClassWithThreshold(selectedRow.deltas?.[m.key], m.score, m.thresholdKey).klass"
                  >
                    {{ fmtDelta(selectedRow.deltas?.[m.key], m.score, m.key) }}
                    <span v-if="deltaClassWithThreshold(selectedRow.deltas?.[m.key], m.score, m.thresholdKey).mutedByThreshold" class="sr-only"> inside the noise threshold</span>
                  </UiTableTd>
                </tr>
              </UiTableShell>
            </section>

            <!-- Diagnostics: FCP/TBT/TTFB/SI — triage signals, not headlines. Collapsed. -->
            <section>
              <button
                type="button"
                class="min-h-6 text-label text-muted hover:text-default transition-colors flex items-center gap-1.5 mb-2"
                :aria-expanded="showLegacyMetrics"
                aria-controls="compare-diagnostic-metrics"
                @click="showLegacyMetrics = !showLegacyMetrics"
              >
                <UiIcon name="chevron-right" class="size-3 transition-transform" :class="{ 'rotate-90': showLegacyMetrics }" />
                Diagnostics ({{ DIAGNOSTIC_METRICS.length }})
              </button>
              <UiTableShell v-if="showLegacyMetrics" id="compare-diagnostic-metrics" bordered label="Diagnostic metric comparison">
                <tr v-for="m in DIAGNOSTIC_METRICS" :key="m.key" class="border-b border-default last:border-0">
                  <UiTableTd class="font-medium text-muted">
                    <UiTooltip :text="m.hint" trigger-as="button">
                      <span>{{ m.label }}</span>
                    </UiTooltip>
                  </UiTableTd>
                  <UiTableTd align="right" class="tabular-nums">
                    {{ fmtMetric(selectedRow.base?.[m.key] ?? null, m.score, m.key) }}
                  </UiTableTd>
                  <UiTableTd align="right" class="tabular-nums">
                    {{ fmtMetric(selectedRow.current?.[m.key] ?? null, m.score, m.key) }}
                  </UiTableTd>
                  <UiTableTd
                    align="right"
                    class="tabular-nums font-medium"
                    :class="deltaClassWithThreshold(selectedRow.deltas?.[m.key], m.score, m.thresholdKey).klass"
                  >
                    {{ fmtDelta(selectedRow.deltas?.[m.key], m.score, m.key) }}
                    <span v-if="deltaClassWithThreshold(selectedRow.deltas?.[m.key], m.score, m.thresholdKey).mutedByThreshold" class="sr-only"> inside the noise threshold</span>
                  </UiTableTd>
                </tr>
              </UiTableShell>
            </section>
          </div>

          <div v-else class="h-full flex items-center justify-center text-sm text-muted p-4 text-center">
            <div class="space-y-2">
              <UiIcon name="mouse-pointer" class="size-8 mx-auto text-muted/40" />
              <p>Select a route to see the full metric breakdown.</p>
            </div>
          </div>
        </SplitterPanel>
      </SplitterGroup>
    </template>
  </div>
</template>
