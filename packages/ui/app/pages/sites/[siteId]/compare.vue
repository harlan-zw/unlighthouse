<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { CompareRouteRow } from '@unlighthouse/contracts'
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
import { useCompareWorkflow } from '~/features/compare/workflow'

definePageMeta({ layout: 'compare' })

const { scoreToColor } = createScoreColorHelpers()
const { fmtScore, fmtDelta, fmtMetric, fmtTimestamp: fmtDate, fmtBytes } = createFormatters()
const {
  siteId,
  currentScanId,
  baseScanId,
  currentMeta,
  currentMetaError,
  refreshCurrentMeta,
  baseMeta,
  otherScans,
  comparing,
  statusFilter,
  deviceFilter,
  urlFilter,
  page,
  sortKey,
  selectedRowKey,
  thresholds,
  report,
  copyingMarkdown,
  showLegacyMetrics,
  showPackDetails,
  copyAsMarkdown,
  cwvP75Rows,
  otherPackChanges,
  handleCompare,
  swapDirection,
  onFilterInput,
  hasMultipleDevices,
  selectedRow,
  totalPages,
  verdict,
  shortId,
  gotoOverview,
} = useCompareWorkflow()

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

const compareColumns = computed<ColumnDef<CompareRouteRow>[]>(() => {
  const cols: ColumnDef<CompareRouteRow>[] = [
    {
      id: 'path',
      header: 'Path',
      enableSorting: false,
      headClass: 'min-w-[200px]',
      cellClass: 'font-mono text-xs',
      cell: ({ row }) => h('span', {
        'class': 'block truncate max-w-[400px]',
        'aria-label': `Route ${row.original.url}`,
      }, row.original.path),
    },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      headClass: 'w-20',
      cell: ({ row }) => h(UiStatusBadgeCmp, { status: compareStatusSemantic(row.original.status), label: row.original.status, class: 'capitalize' }),
    },
  ]
  if (hasMultipleDevices.value) {
    cols.push({
      id: 'device',
      header: 'Dev',
      enableSorting: false,
      align: 'center',
      headClass: 'w-16',
      cell: ({ row }) => h(IconCmp, {
        name: row.original.device === 'mobile' ? 'smartphone' : 'monitor',
        class: 'size-3.5 text-muted inline',
      }),
    })
  }
  for (const m of CATEGORY_METRICS) {
    cols.push({
      id: m.key,
      header: SHORT_LABEL[m.key] ?? m.label,
      enableSorting: false,
      align: 'right',
      headClass: 'w-16',
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
  <div class="h-full flex flex-col">
    <h1 class="sr-only">
      Compare scans
    </h1>
    <!-- Couldn't load the current scan — the compare can't proceed, so
         surface it above the toolbar with a retry. -->
    <QueryError v-if="currentMetaError" :error="currentMetaError" :on-retry="refreshCurrentMeta" class="m-4" />

    <!-- Top toolbar — base/current scan identity, swap, picker, actions -->
    <div class="border-b bg-default/50">
      <div class="px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <UiIcon name="compare" class="size-4 text-muted shrink-0" />

        <!-- Base scan -->
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-label text-muted shrink-0">Base</span>
          <USelect
            v-model="baseScanId"
            aria-label="Base scan"
            :items="otherScans.map(s => ({ value: s.scanId, label: `${shortId(s.scanId)} · ${s.device}`, scan: s }))"
            placeholder="Select previous scan"
            size="sm"
            class="min-w-[220px] max-w-[320px]"
          >
            <template #item="{ item }">
              <div class="flex items-center gap-2 text-xs">
                <span class="font-mono">{{ shortId(item.scan.scanId) }}</span>
                <UiChip purpose="count">
                  {{ item.scan.device }}
                </UiChip>
                <span class="text-muted">{{ fmtDate(item.scan.completedAt || item.scan.startedAt) }}</span>
                <span v-if="item.scan.ciCommit" class="font-mono text-xs text-muted">{{ item.scan.ciCommit.slice(0, 7) }}</span>
              </div>
            </template>
          </USelect>
        </div>

        <!-- Swap -->
        <UiTooltip text="Swap base ↔ current" trigger-as="child">
          <UiButton purpose="quiet" size="sm" class="size-8 p-0 justify-center" :disabled="!baseScanId" icon="compare" aria-label="Swap base and current" @click="swapDirection" />
        </UiTooltip>

        <!-- Current scan -->
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-label text-muted shrink-0">Current</span>
          <span class="font-mono text-xs">{{ shortId(currentScanId) }}</span>
          <UiChip v-if="currentMeta" purpose="count">
            {{ currentMeta.device }}
          </UiChip>
          <span v-if="currentMeta" class="text-xs text-muted truncate max-w-[200px]">{{ currentMeta.site }}</span>
        </div>

        <div class="ml-auto flex items-center gap-1.5">
          <!-- Thresholds popover -->
          <UiPopover>
            <UiButton purpose="secondary" size="sm" icon="sliders">
              Edit thresholds
            </UiButton>
            <template #panel>
              <div class="w-96 p-4 space-y-3">
                <div>
                  <h2 class="text-sm font-semibold">
                    Regression thresholds
                  </h2>
                  <p class="text-xs text-muted">
                    Empty = CI defaults. Deltas within threshold render muted (treated as noise).
                  </p>
                </div>

                <!-- Single inline note about sampling — explained once,
                     not as a banner the user has to dismiss. -->
                <UiAlert status="warning" icon="info">
                  CWV is noisy on parallel single-sample runs. Run with <code class="code-inline text-xs">--samples 3</code> for stability, or widen these thresholds.
                </UiAlert>

                <div class="space-y-3 text-xs">
                  <div>
                    <div class="text-label text-muted mb-1.5">
                      Category scores (0–1)
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      <label class="space-y-1">
                        <span class="text-muted">Performance</span>
                        <UInput v-model="thresholds.performance" name="threshold-performance" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.05" size="xs" class="w-full" />
                      </label>
                      <label class="space-y-1">
                        <span class="text-muted">Accessibility</span>
                        <UInput v-model="thresholds.accessibility" name="threshold-accessibility" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.05" size="xs" class="w-full" />
                      </label>
                      <label class="space-y-1">
                        <span class="text-muted">SEO</span>
                        <UInput v-model="thresholds.seo" name="threshold-seo" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.05" size="xs" class="w-full" />
                      </label>
                      <label class="space-y-1">
                        <span class="text-muted">Best Practices</span>
                        <UInput v-model="thresholds['best-practices']" name="threshold-best-practices" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.05" size="xs" class="w-full" />
                      </label>
                      <label class="space-y-1">
                        <span class="text-muted">Agentic</span>
                        <UInput v-model="thresholds['agentic-browsing']" name="threshold-agentic-browsing" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.05" size="xs" class="w-full" />
                      </label>
                    </div>
                  </div>

                  <div>
                    <div class="text-label text-muted mb-1.5">
                      Core Web Vitals
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      <label class="space-y-1">
                        <span class="text-muted flex justify-between">
                          LCP (ms)
                          <span class="text-xs italic text-muted/70">≈ 300ms noise</span>
                        </span>
                        <UInput v-model="thresholds.lcp" name="threshold-lcp" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="500" size="xs" class="w-full" />
                      </label>
                      <label class="space-y-1">
                        <span class="text-muted flex justify-between">
                          CLS
                          <span class="text-xs italic text-muted/70">≈ 0.02 noise</span>
                        </span>
                        <UInput v-model="thresholds.cls" name="threshold-cls" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="0.1" size="xs" class="w-full" />
                      </label>
                      <label class="space-y-1">
                        <span class="text-muted flex justify-between">
                          INP (ms)
                          <span class="text-xs italic text-muted/70">≈ 100ms noise</span>
                        </span>
                        <UInput v-model="thresholds.inp" name="threshold-inp" type="number" inputmode="decimal" step="any" autocomplete="off" placeholder="200" size="xs" class="w-full" />
                      </label>
                    </div>
                  </div>
                </div>

                <UiButton purpose="cta" size="sm" class="w-full justify-center" @click="handleCompare">
                  Apply thresholds
                </UiButton>
              </div>
            </template>
          </UiPopover>

          <UiButton purpose="secondary" size="sm" :loading="copyingMarkdown" :disabled="copyingMarkdown || !baseScanId || !report" icon="copy" @click="copyAsMarkdown">
            Copy markdown
          </UiButton>

          <UiButton purpose="cta" size="sm" :loading="comparing" :disabled="!baseScanId || comparing" icon="refresh" @click="handleCompare">
            Compare scans
          </UiButton>
        </div>
      </div>

      <!-- Scan-metadata strip — visible only when both scans are loaded -->
      <div v-if="baseMeta && currentMeta" class="px-4 py-2 text-xs flex items-center gap-4 flex-wrap border-t bg-default/40">
        <button type="button" class="min-h-6 hover:underline text-muted hover:text-default inline-flex items-center gap-1" @click="gotoOverview(baseScanId)">
          <UiIcon name="external" class="size-3" />
          Base: {{ fmtDate(baseMeta.completedAt || baseMeta.startedAt) }}
          <span v-if="baseMeta.ciCommit" class="font-mono text-xs">· {{ baseMeta.ciCommit.slice(0, 7) }}</span>
          <span v-if="baseMeta.ciBranch" class="text-xs">· {{ baseMeta.ciBranch }}</span>
        </button>
        <UiIcon name="next" class="size-3 text-muted" />
        <button type="button" class="min-h-6 hover:underline text-muted hover:text-default inline-flex items-center gap-1" @click="gotoOverview(currentScanId)">
          <UiIcon name="external" class="size-3" />
          Current: {{ fmtDate(currentMeta.completedAt || currentMeta.startedAt) }}
          <span v-if="currentMeta.ciCommit" class="font-mono text-xs">· {{ currentMeta.ciCommit.slice(0, 7) }}</span>
          <span v-if="currentMeta.ciBranch" class="text-xs">· {{ currentMeta.ciBranch }}</span>
        </button>
      </div>
    </div>

    <!-- Empty state — no base picked yet -->
    <div v-if="!baseScanId" class="flex-1 flex items-center justify-center p-8">
      <UiCard class="max-w-md">
        <div class="text-center space-y-3">
          <UiIcon name="compare" class="size-12 text-muted/40 mx-auto" />
          <h2 class="font-semibold">
            Pick a scan to compare against
          </h2>
          <p class="text-sm text-muted">
            Select a base scan for <span class="font-mono text-xs">{{ currentMeta?.site || 'this site' }}</span>. The most recent scan on the same device + branch is auto-selected when available.
          </p>
          <p v-if="!otherScans.length" class="text-xs text-muted">
            Run another scan of this site to create a comparison baseline.
          </p>
        </div>
      </UiCard>
    </div>

    <!-- No report yet but base picked: instructive empty state -->
    <div v-else-if="!report && !comparing" class="flex-1 flex items-center justify-center p-8">
      <UiCard class="max-w-md">
        <div class="text-center space-y-3">
          <UiIcon name="play" class="size-10 text-muted/40 mx-auto" />
          <p class="text-sm text-muted">
            Diff pending for the selected base and current scans.
          </p>
        </div>
      </UiCard>
    </div>

    <!-- Loading -->
    <div v-else-if="comparing && !report" class="flex-1 flex items-center justify-center">
      <UiIcon name="loading" class="size-6 animate-spin text-muted" />
    </div>

    <!-- Report body -->
    <template v-else-if="report">
      <!-- Summary band -->
      <div class="px-4 py-3 border-b flex items-center gap-6 flex-wrap">
        <UiChip v-if="verdict" purpose="status" :status="toneSemantic(verdict.tone)" size="sm" class="!bg-transparent ring-1 ring-inset ring-current/20">
          {{ verdict.text }}
        </UiChip>
        <div class="flex items-center gap-4 text-xs">
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
            <span class="text-muted">Avg Score Δ</span>
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
            ({{ fmtDelta(row.delta, false) }})
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
        <div class="relative w-64">
          <UiIcon name="search" class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted pointer-events-none" />
          <UInput name="compare-route-filter" type="search" autocomplete="off" aria-label="Filter routes by URL or path" placeholder="Filter by URL or path…" size="sm" class="w-full" :model-value="urlFilter" :ui="{ base: 'pl-8' }" @update:model-value="onFilterInput" />
        </div>

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

        <UTabs
          v-if="hasMultipleDevices"
          v-model="deviceFilter"
          :content="false"
          size="sm"
          :items="[
            { value: '', label: 'All' },
            { value: 'mobile', label: 'Mobile', icon: 'smartphone' },
            { value: 'desktop', label: 'Desktop', icon: 'monitor' },
          ]"
        />

        <USelect v-model="sortKey" :items="sortOptions" aria-label="Sort routes" size="sm" class="w-44" />

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
      <SplitterGroup direction="horizontal" class="flex-1 min-h-0 min-w-0 overflow-hidden">
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
                No routes match the current filter.
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

        <SplitterResizeHandle class="w-1.5 bg-[var(--ui-border)]/40 hover:bg-accented transition-colors data-[state=drag]:bg-inverted/60" />

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
                    {{ fmtMetric(selectedRow.base?.[m.key] ?? null, m.score) }}
                  </UiTableTd>
                  <UiTableTd align="right" class="tabular-nums">
                    {{ fmtMetric(selectedRow.current?.[m.key] ?? null, m.score) }}
                  </UiTableTd>
                  <UiTableTd
                    align="right"
                    class="tabular-nums font-medium"
                    :class="deltaClassWithThreshold(selectedRow.deltas?.[m.key], m.score, m.thresholdKey).klass"
                  >
                    {{ fmtDelta(selectedRow.deltas?.[m.key], m.score) }}
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
                    {{ fmtMetric(selectedRow.base?.[m.key] ?? null, m.score) }}
                  </UiTableTd>
                  <UiTableTd align="right" class="tabular-nums">
                    {{ fmtMetric(selectedRow.current?.[m.key] ?? null, m.score) }}
                  </UiTableTd>
                  <UiTableTd
                    align="right"
                    class="tabular-nums font-medium"
                    :class="deltaClassWithThreshold(selectedRow.deltas?.[m.key], m.score, m.thresholdKey).klass"
                  >
                    {{ fmtDelta(selectedRow.deltas?.[m.key], m.score) }}
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
                    {{ fmtMetric(selectedRow.base?.[m.key] ?? null, m.score) }}
                  </UiTableTd>
                  <UiTableTd align="right" class="tabular-nums">
                    {{ fmtMetric(selectedRow.current?.[m.key] ?? null, m.score) }}
                  </UiTableTd>
                  <UiTableTd
                    align="right"
                    class="tabular-nums font-medium"
                    :class="deltaClassWithThreshold(selectedRow.deltas?.[m.key], m.score, m.thresholdKey).klass"
                  >
                    {{ fmtDelta(selectedRow.deltas?.[m.key], m.score) }}
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
