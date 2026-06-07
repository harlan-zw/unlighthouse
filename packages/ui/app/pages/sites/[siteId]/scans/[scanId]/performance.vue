<script setup lang="ts">
definePageMeta({ layout: 'scan' })

const api = useApi()
const scanId = getScanId()
const { scoreToColor, scoreToLabel } = useScoreColor()

const { data: cwvData, status: cwvStatus } = useAsyncData(
  `perf-cwv-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'cwv' }).catch(() => null),
)

const { data: insightsData } = useAsyncData(
  `perf-insights-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'insights' }).catch(() => null),
)

const { data: imagesData } = useAsyncData(
  `perf-images-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'images' }).catch(() => null),
)

const { data: routeScores } = useAsyncData(
  `perf-routes-${scanId}`,
  () => api['scan.results']({ scanId, page: 1, pageSize: 200, sort: 'score-asc' }).catch(() => null),
)

const { fmtMs: formatMs, fmtBytes: formatBytes } = useFormat()

function verdictColor(verdict: string) {
  if (verdict === 'good') return 'text-green-500'
  if (verdict === 'needsImprovement') return 'text-orange-500'
  return 'text-red-500'
}

function severityVariant(severity: string) {
  if (severity === 'critical' || severity === 'serious') return 'destructive' as const
  if (severity === 'moderate') return 'secondary' as const
  return 'outline' as const
}

const cwvReport = computed(() => (cwvData.value as any)?.report ?? null)
const insightsReport = computed(() => (insightsData.value as any)?.report ?? null)
const imagesReport = computed(() => (imagesData.value as any)?.report ?? null)

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
    :report="hasData ? true : null"
    empty-message="No performance data available. Run a scan first."
    loading-message="Loading performance data..."
  >
    <!-- Core Web Vitals -->
      <div v-if="cwvReport?.metrics?.length" class="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <UCard v-for="m in cwvReport.metrics" :key="m.metric">
          <div class="text-center">
            <div class="text-xs text-muted mb-1">{{ m.metric?.toUpperCase() }}</div>
            <div class="text-2xl font-bold tabular-nums" :class="verdictColor(m.verdict)">
              {{ m.p75 != null ? (m.metric === 'cls' ? m.p75.toFixed(3) : formatMs(m.p75)) : '—' }}
            </div>
            <div class="text-[10px] text-muted mt-1">p75 across {{ (m.distribution?.good ?? 0) + (m.distribution?.needsImprovement ?? 0) + (m.distribution?.poor ?? 0) }} routes</div>
            <div class="flex justify-center gap-1 mt-2">
              <UBadge variant="outline" class="text-[9px] text-green-600">{{ m.distribution?.good ?? 0 }} good</UBadge>
              <UBadge variant="outline" class="text-[9px] text-orange-600">{{ m.distribution?.needsImprovement ?? 0 }} NI</UBadge>
              <UBadge variant="outline" class="text-[9px] text-red-600">{{ m.distribution?.poor ?? 0 }} poor</UBadge>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Top Fixes from CWV pack -->
      <UCard v-if="cwvReport?.topFixes?.length">
        <template #header>
          <div class="text-sm font-medium text-muted">Top Fixes (by impact)</div>
        </template>
        <div class="space-y-3">
          <div v-for="fix in cwvReport.topFixes.slice(0, 10)" :key="fix.auditId" class="flex items-start gap-3 p-3 border border-default rounded-lg">
            <div class="flex-1">
              <div class="text-sm font-medium">{{ fix.title || fix.auditId }}</div>
              <div class="text-xs text-muted mt-0.5">{{ fix.routeCount }} routes affected</div>
            </div>
            <div class="flex gap-1 flex-wrap justify-end">
              <UBadge v-for="(val, key) in fix.totalSavings" :key="key" variant="outline" class="text-[10px]">
                {{ key }}: {{ typeof val === 'number' ? formatMs(val) : val }}
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Insights pack -->
      <UCard v-if="insightsReport?.insights?.length">
        <template #header>
          <div class="text-sm font-medium text-muted">
            Performance Insights
            <UBadge color="neutral" variant="subtle" class="ml-2 text-xs">{{ insightsReport.insights.length }}</UBadge>
          </div>
        </template>
        <div class="space-y-3">
          <div v-for="insight in insightsReport.insights" :key="insight.id" class="p-3 border border-default rounded-lg">
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium">{{ insight.title || insight.id }}</div>
              <UBadge variant="outline" class="text-xs">{{ insight.routeCount }} routes</UBadge>
            </div>
            <div class="flex gap-1 mt-2 flex-wrap">
              <UBadge v-for="(val, key) in insight.totalSavings" :key="key" color="neutral" variant="subtle" class="text-[10px]">
                {{ key }}: {{ typeof val === 'number' ? formatMs(val) : val }}
              </UBadge>
            </div>
            <div v-if="insight.worstRoutes?.length" class="mt-2 text-xs text-muted">
              Worst: <span v-for="(wr, i) in insight.worstRoutes.slice(0, 3)" :key="wr.url" class="font-mono">{{ wr.url }}{{ Number(i) < Math.min(insight.worstRoutes.length, 3) - 1 ? ', ' : '' }}</span>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Image Optimization -->
      <UCard v-if="imagesReport?.findings?.length">
        <template #header>
          <div class="text-sm font-medium text-muted flex items-center gap-2">
            <Icon name="lucide:image" class="size-4" />
            Image Optimization
            <UBadge color="neutral" variant="subtle" class="text-xs">{{ imagesReport.findings.length }} issues</UBadge>
            <UBadge v-if="imagesReport.totalBytesSavable > 0" variant="outline" class="text-xs text-orange-500">
              {{ formatBytes(imagesReport.totalBytesSavable) }} savable
            </UBadge>
          </div>
        </template>
        <div v-if="imagesReport.severityCounts" class="flex gap-2 flex-wrap mb-4">
          <UBadge v-if="imagesReport.severityCounts.critical > 0" color="error" class="text-xs">{{ imagesReport.severityCounts.critical }} critical</UBadge>
          <UBadge v-if="imagesReport.severityCounts.serious > 0" color="error" class="text-xs">{{ imagesReport.severityCounts.serious }} serious</UBadge>
          <UBadge v-if="imagesReport.severityCounts.moderate > 0" color="neutral" variant="subtle" class="text-xs">{{ imagesReport.severityCounts.moderate }} moderate</UBadge>
          <UBadge v-if="imagesReport.severityCounts.minor > 0" variant="outline" class="text-xs">{{ imagesReport.severityCounts.minor }} minor</UBadge>
        </div>
        <div class="w-full divide-y divide-default border-y border-default">
          <details v-for="finding in imagesReport.findings.slice(0, 20)" :key="finding.imageUrl" class="group">
            <summary class="flex items-center gap-3 text-sm cursor-pointer list-none py-3">
              <Icon name="lucide:chevron-right" class="size-4 text-muted shrink-0 transition-transform group-open:rotate-90" />
              <div class="flex items-center gap-3 text-left flex-1 min-w-0">
                <UBadge
                  :color="severityVariant(finding.severity) === 'destructive' ? 'error' : 'neutral'"
                  :variant="severityVariant(finding.severity) === 'destructive' ? 'solid' : severityVariant(finding.severity) === 'secondary' ? 'subtle' : 'outline'"
                  class="text-[10px] shrink-0"
                >
                  {{ finding.severity }}
                </UBadge>
                <span class="truncate font-mono text-xs">{{ finding.imageUrl }}</span>
                <span class="text-xs text-muted shrink-0">{{ finding.routeCount }} routes</span>
              </div>
            </summary>
            <div class="text-sm space-y-3 pb-3 pl-7">
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
                    class="w-32 h-20 object-contain bg-muted rounded border border-default"
                    @error="(e) => { const el = e.target as HTMLImageElement; el.style.display = 'none' }"
                  >
                </a>
                <div class="flex-1 min-w-0 space-y-2">
                  <div class="flex gap-2 flex-wrap">
                    <UBadge variant="outline" class="text-xs">{{ finding.kind }}</UBadge>
                    <UBadge v-if="finding.wastedBytes" variant="outline" class="text-xs text-orange-500">{{ formatBytes(finding.wastedBytes) }} wasted</UBadge>
                    <UBadge v-if="finding.lcpImpactMs" variant="outline" class="text-xs text-red-500">LCP +{{ formatMs(finding.lcpImpactMs) }}</UBadge>
                  </div>
                  <p v-if="finding.reason" class="text-xs text-muted">{{ finding.reason }}</p>
                  <div v-if="finding.routes?.length" class="text-xs text-muted">
                    <ul class="mt-1 space-y-0.5 font-mono">
                      <li v-for="r in finding.routes" :key="r">{{ r }}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>
        <p v-if="imagesReport.findings.length > 20" class="text-xs text-muted mt-3 text-center">
          +{{ imagesReport.findings.length - 20 }} more image issues
        </p>
      </UCard>

      <!-- Route Scores -->
      <UCard v-if="routeScores?.items?.length">
        <template #header>
          <div class="text-sm font-medium text-muted">Route Scores</div>
        </template>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-muted">
              <th class="text-left font-medium py-2 px-3">Path</th>
              <th class="w-20 text-right font-medium py-2 px-3">Score</th>
              <th class="w-24 text-right font-medium py-2 px-3">LCP</th>
              <th class="w-20 text-right font-medium py-2 px-3">CLS</th>
              <th class="w-24 text-right font-medium py-2 px-3">TBT</th>
              <th class="w-24 text-right font-medium py-2 px-3">INP</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in routeScores.items.slice(0, 50)"
              :key="r.url"
              class="border-b border-default last:border-0 cursor-pointer hover:bg-muted/50"
              @click="navigateTo(`/sites/${$route.params.siteId}/scans/${scanId}/route/${encodeURIComponent(r.path)}`)"
            >
              <td class="font-mono text-xs truncate max-w-sm py-2 px-3">{{ r.path }}</td>
              <td class="text-right tabular-nums font-bold py-2 px-3" :class="scoreToColor(r.scorePerformance)">{{ scoreToLabel(r.scorePerformance) }}</td>
              <td class="text-right tabular-nums text-xs py-2 px-3">{{ r.lcp != null ? formatMs(r.lcp) : '—' }}</td>
              <td class="text-right tabular-nums text-xs py-2 px-3">{{ r.cls?.toFixed(3) ?? '—' }}</td>
              <td class="text-right tabular-nums text-xs py-2 px-3">{{ r.tbt != null ? formatMs(r.tbt) : '—' }}</td>
              <td class="text-right tabular-nums text-xs py-2 px-3">{{ r.inp != null ? formatMs(r.inp) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </UCard>

  </CategoryPageShell>
</template>
