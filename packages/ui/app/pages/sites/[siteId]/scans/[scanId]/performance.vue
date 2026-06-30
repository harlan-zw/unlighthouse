<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { CwvReport, ImagesReport, InsightsReport } from '@unlighthouse/contracts/packs'
import { h } from 'vue'
import CategoryPageShell from '~/features/scan/components/CategoryPageShell.vue'
import { getScanId, useScanBase } from '~/features/scan/route-context'

definePageMeta({ layout: 'scan' })

const scanId = getScanId()
const { scanBase } = useScanBase()
const { scoreToColor, scoreToLabel } = createScoreColorHelpers()

const { data: cwvData, status: cwvStatus, error: cwvError, refresh: refreshCwv } = useApiQuery('pack.run', () => ({ scanId, pack: 'cwv' }))
const { data: insightsData } = useApiQuery('pack.run', () => ({ scanId, pack: 'insights' }))
const { data: imagesData } = useApiQuery('pack.run', () => ({ scanId, pack: 'images' }))
const { data: routeScores } = useApiQuery('scan.results', () => ({ scanId, page: 1, pageSize: 200, sort: 'score-asc' }))

const { fmtMs: formatMs, fmtBytes: formatBytes } = createFormatters()

type RouteScoreRow = NonNullable<typeof routeScores['value']>['items'][number]
const numCell = (v: string) => h('span', { class: 'tabular-nums text-xs' }, v)
const routeScoreColumns: ColumnDef<RouteScoreRow>[] = [
  {
    accessorKey: 'path',
    header: 'Path',
    cell: ({ row }) => h('span', { class: 'font-mono text-xs truncate block max-w-sm' }, row.original.path),
  },
  {
    accessorKey: 'scorePerformance',
    header: 'Score',
    align: 'right',
    headClass: 'w-20',
    cell: ({ row }) => h('span', { class: `tabular-nums font-bold ${scoreToColor(row.original.scorePerformance)}` }, scoreToLabel(row.original.scorePerformance)),
  },
  { accessorKey: 'lcp', header: 'LCP', align: 'right', headClass: 'w-24', cell: ({ row }) => numCell(row.original.lcp != null ? formatMs(row.original.lcp) : '—') },
  { accessorKey: 'cls', header: 'CLS', align: 'right', headClass: 'w-20', cell: ({ row }) => numCell(row.original.cls?.toFixed(3) ?? '—') },
  { accessorKey: 'tbt', header: 'TBT', align: 'right', headClass: 'w-24', cell: ({ row }) => numCell(row.original.tbt != null ? formatMs(row.original.tbt) : '—') },
  { accessorKey: 'inp', header: 'INP', align: 'right', headClass: 'w-24', cell: ({ row }) => numCell(row.original.inp != null ? formatMs(row.original.inp) : '—') },
]

function verdictColor(verdict: string | null) {
  if (verdict === 'good')
    return 'text-success'
  if (verdict === 'needsImprovement')
    return 'text-warning'
  if (verdict == null)
    return 'text-muted'
  return 'text-error'
}

function severityVariant(severity: string) {
  if (severity === 'critical' || severity === 'serious')
    return 'error' as const
  if (severity === 'moderate')
    return 'warning' as const
  return 'neutral' as const
}

// Image findings → UAccordion items (stable value = imageUrl). Capped to 20
// by default so a noisy report doesn't flood the page; the user can expand
// to the full list on demand.
const IMAGE_CAP = 20
const showAllImages = ref(false)
const allImageFindings = computed(() => imagesReport.value?.findings ?? [])
const hiddenImageCount = computed(() => Math.max(0, allImageFindings.value.length - IMAGE_CAP))
const imageItems = computed(() =>
  (showAllImages.value ? allImageFindings.value : allImageFindings.value.slice(0, IMAGE_CAP))
    .map(f => ({ ...f, value: f.imageUrl })),
)

const cwvReport = computed(() => (cwvData.value?.report ?? null) as CwvReport | null)
const insightsReport = computed(() => (insightsData.value?.report ?? null) as InsightsReport | null)
const imagesReport = computed(() => (imagesData.value?.report ?? null) as ImagesReport | null)
function openRoute(path: string) {
  return navigateTo(`${scanBase.value}/route/${encodeURIComponent(path)}`)
}

// Performance pulls from three packs (cwv / insights / images) plus
// route scores. "Ready" when any pack produced a report; pass the
// combined signal to the shell so the empty state only appears when
// none did.
const hasData = computed(() => cwvReport.value || insightsReport.value || imagesReport.value)
</script>

<template>
  <CategoryPageShell
    title="Performance"
    pack="cwv"
    :status="cwvStatus"
    :error="cwvError"
    :on-retry="refreshCwv"
    :report="hasData ? true : null"
    empty-message="No performance data available. Run a scan first."
    loading-message="Loading performance data..."
  >
    <!-- Core Web Vitals -->
    <div v-if="cwvReport?.metrics?.length" class="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <div v-for="m in cwvReport.metrics" :key="m.metric" class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 text-center">
        <div class="text-xs text-muted mb-1">
          {{ m.metric?.toUpperCase() }}
        </div>
        <div class="numerals-display text-2xl" :class="verdictColor(m.verdict)">
          {{ m.p75 != null ? (m.metric === 'cls' ? m.p75.toFixed(3) : formatMs(m.p75)) : '—' }}
        </div>
        <div class="text-[10px] text-muted mt-1">
          p75 across {{ (m.distribution?.good ?? 0) + (m.distribution?.needsImprovement ?? 0) + (m.distribution?.poor ?? 0) }} routes
        </div>
        <div class="flex justify-center gap-1 mt-2">
          <UBadge color="neutral" variant="outline" class="text-[9px] text-success">
            {{ m.distribution?.good ?? 0 }} good
          </UBadge>
          <UBadge color="neutral" variant="outline" class="text-[9px] text-warning">
            {{ m.distribution?.needsImprovement ?? 0 }} NI
          </UBadge>
          <UBadge color="neutral" variant="outline" class="text-[9px] text-error">
            {{ m.distribution?.poor ?? 0 }} poor
          </UBadge>
        </div>
      </div>
    </div>

    <!-- Top Fixes from CWV pack -->
    <UiCard v-if="cwvReport?.topFixes?.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed">
          Top Fixes (by impact)
        </h3>
      </template>
      <div class="space-y-3">
        <div v-for="fix in cwvReport.topFixes.slice(0, 10)" :key="`${fix.insight}:${fix.metric}`" class="flex items-start gap-3 p-3 border rounded-lg">
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ fix.title || fix.insight }}
            </div>
            <div class="text-xs text-muted mt-0.5">
              {{ fix.routeCount }} routes affected · {{ fix.metric.toUpperCase() }}
            </div>
          </div>
          <div class="flex gap-1 flex-wrap justify-end">
            <UBadge color="neutral" variant="outline" class="text-[10px]">
              {{ formatMs(fix.maxImpactMs) }} max impact
            </UBadge>
          </div>
        </div>
      </div>
    </UiCard>

    <!-- Insights pack -->
    <UiCard v-if="insightsReport?.insights?.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed">
          Performance Insights
          <UBadge color="neutral" variant="soft" class="ml-2 text-xs">
            {{ insightsReport.insights.length }}
          </UBadge>
        </h3>
      </template>
      <div class="space-y-3">
        <div v-for="insight in insightsReport.insights" :key="insight.id" class="p-3 border rounded-lg">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium">
              {{ insight.title || insight.id }}
            </div>
            <UBadge color="neutral" variant="outline" class="text-xs">
              {{ insight.routeCount }} routes
            </UBadge>
          </div>
          <div class="flex gap-1 mt-2 flex-wrap">
            <UBadge v-for="(val, key) in insight.totalSavings" :key="key" color="neutral" variant="soft" class="text-[10px]">
              {{ key }}: {{ typeof val === 'number' ? formatMs(val) : val }}
            </UBadge>
          </div>
          <div v-if="insight.worstRoutes?.length" class="mt-2 text-xs text-muted">
            Worst: <span v-for="(wr, i) in insight.worstRoutes.slice(0, 3)" :key="wr.url" class="font-mono">{{ wr.url }}{{ Number(i) < Math.min(insight.worstRoutes.length, 3) - 1 ? ', ' : '' }}</span>
          </div>
        </div>
      </div>
    </UiCard>

    <!-- Image Optimization -->
    <UiCard v-if="imagesReport?.findings?.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed flex items-center gap-2">
          <UiIcon name="image" class="size-4" />
          Image Optimization
          <UBadge color="neutral" variant="soft" class="text-xs">
            {{ imagesReport.findings.length }} issues
          </UBadge>
          <UBadge v-if="imagesReport.totalBytesSavable > 0" color="neutral" variant="outline" class="text-xs text-warning">
            {{ formatBytes(imagesReport.totalBytesSavable) }} savable
          </UBadge>
        </h3>
      </template>
      <div v-if="imagesReport.severityCounts" class="flex gap-2 flex-wrap mb-4">
        <UBadge v-if="imagesReport.severityCounts.critical > 0" color="error" variant="soft" class="text-xs">
          {{ imagesReport.severityCounts.critical }} critical
        </UBadge>
        <UBadge v-if="imagesReport.severityCounts.serious > 0" color="error" variant="soft" class="text-xs">
          {{ imagesReport.severityCounts.serious }} serious
        </UBadge>
        <UBadge v-if="imagesReport.severityCounts.moderate > 0" color="neutral" variant="soft" class="text-xs">
          {{ imagesReport.severityCounts.moderate }} moderate
        </UBadge>
        <UBadge v-if="imagesReport.severityCounts.minor > 0" color="neutral" variant="outline" class="text-xs">
          {{ imagesReport.severityCounts.minor }} minor
        </UBadge>
      </div>
      <UAccordion :items="imageItems" type="multiple" class="w-full">
        <template #default="{ item: finding }">
          <div class="flex items-center gap-3 text-left flex-1 min-w-0 text-sm">
            <UBadge :color="severityVariant(finding.severity)" variant="soft" class="text-[10px] shrink-0">
              {{ finding.severity }}
            </UBadge>
            <span class="truncate font-mono text-xs">{{ finding.imageUrl }}</span>
            <span class="text-xs text-muted shrink-0">{{ finding.routeCount }} routes</span>
          </div>
        </template>
        <template #content="{ item: finding }">
          <div class="text-sm space-y-3 pb-2">
            <div class="flex gap-4 items-start">
              <!-- The actual offending image — referrerpolicy=no-referrer
                         so origin servers that block hotlinking still render
                         (we're loading their public asset, not stealing it). -->
              <a :href="finding.imageUrl" target="_blank" rel="noopener" class="shrink-0">
                <img
                  :src="finding.imageUrl"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  alt=""
                  class="w-32 h-20 object-contain bg-elevated rounded border"
                  @error="(e) => { const el = e.target as HTMLImageElement; el.style.display = 'none' }"
                >
              </a>
              <div class="flex-1 min-w-0 space-y-2">
                <div class="flex gap-2 flex-wrap">
                  <UBadge color="neutral" variant="outline" class="text-xs">
                    {{ finding.kind }}
                  </UBadge>
                  <UBadge v-if="finding.wastedBytes" color="neutral" variant="outline" class="text-xs text-warning">
                    {{ formatBytes(finding.wastedBytes) }} wasted
                  </UBadge>
                  <UBadge v-if="finding.lcpImpactMs" color="neutral" variant="outline" class="text-xs text-error">
                    LCP +{{ formatMs(finding.lcpImpactMs) }}
                  </UBadge>
                </div>
                <p v-if="finding.reason" class="text-xs text-muted">
                  {{ finding.reason }}
                </p>
                <div v-if="finding.routes?.length" class="text-xs text-muted">
                  <ul class="mt-1 space-y-0.5 font-mono">
                    <li v-for="r in finding.routes" :key="r">
                      {{ r }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </template>
      </UAccordion>
      <div v-if="hiddenImageCount > 0 || showAllImages" class="mt-3 text-center">
        <UiButton purpose="quiet" size="sm" :icon="showAllImages ? 'chevron-up' : 'chevron-down'" @click="showAllImages = !showAllImages">
          {{ showAllImages ? 'Show fewer' : `Show ${hiddenImageCount} more image ${hiddenImageCount === 1 ? 'issue' : 'issues'}` }}
        </UiButton>
      </div>
    </UiCard>

    <!-- Route Scores -->
    <UiCard v-if="routeScores?.items?.length" size="sm">
      <template #header>
        <h3 class="text-label text-dimmed">
          Route Scores
        </h3>
      </template>
      <UiTable
        :columns="routeScoreColumns"
        :data="routeScores.items.slice(0, 50)"
        row-clickable
        disable-pagination
        @row-click="(r) => openRoute(r.path)"
      />
    </UiCard>
  </CategoryPageShell>
</template>
