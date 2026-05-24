<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const route = useRoute()
const api = useApi()
const scanId = route.params.id as string
const { scoreToColor, scoreToLabel } = useScoreColor()

const { data: cwvData, status: cwvStatus } = useAsyncData(
  `perf-cwv-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'cwv' }).catch(() => null),
)

const { data: insightsData } = useAsyncData(
  `perf-insights-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'insights' }).catch(() => null),
)

const { data: routeScores } = useAsyncData(
  `perf-routes-${scanId}`,
  () => api['scan.results']({ scanId, page: 1, pageSize: 200, sort: 'score-asc' }).catch(() => null),
)

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function verdictColor(verdict: string) {
  if (verdict === 'good') return 'text-green-500'
  if (verdict === 'needsImprovement') return 'text-orange-500'
  return 'text-red-500'
}

const cwvReport = computed(() => (cwvData.value as any)?.report ?? null)
const insightsReport = computed(() => (insightsData.value as any)?.report ?? null)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink :to="`/scan/${scanId}/overview`">
          <Icon name="lucide:arrow-left" class="size-4 mr-1" />
          Overview
        </NuxtLink>
      </Button>
      <h1 class="text-xl font-bold tracking-tight">Performance</h1>
    </div>

    <div v-if="cwvStatus === 'pending'" class="text-center py-12 text-muted-foreground">
      Loading performance data...
    </div>

    <template v-else>
      <!-- Core Web Vitals -->
      <div v-if="cwvReport?.metrics" class="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card v-for="m in cwvReport.metrics" :key="m.name">
          <CardContent class="pt-5 pb-4 text-center">
            <div class="text-xs text-muted-foreground mb-1">{{ m.name.toUpperCase() }}</div>
            <div class="text-2xl font-bold tabular-nums" :class="verdictColor(m.verdict)">
              {{ m.p75 != null ? formatMs(m.p75) : '—' }}
            </div>
            <div class="text-[10px] text-muted-foreground mt-1">p75 across {{ m.routeCount }} routes</div>
            <div class="flex justify-center gap-1 mt-2">
              <Badge variant="outline" class="text-[9px] text-green-600">{{ m.good }} good</Badge>
              <Badge variant="outline" class="text-[9px] text-orange-600">{{ m.needsImprovement }} NI</Badge>
              <Badge variant="outline" class="text-[9px] text-red-600">{{ m.poor }} poor</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Top Fixes from CWV pack -->
      <Card v-if="cwvReport?.topFixes?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Top Fixes (by impact)</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <div v-for="fix in cwvReport.topFixes.slice(0, 10)" :key="fix.auditId" class="flex items-start gap-3 p-3 border rounded-lg">
              <div class="flex-1">
                <div class="text-sm font-medium">{{ fix.title || fix.auditId }}</div>
                <div class="text-xs text-muted-foreground mt-0.5">{{ fix.routeCount }} routes affected</div>
              </div>
              <div class="flex gap-1 flex-wrap justify-end">
                <Badge v-for="(val, key) in fix.totalSavings" :key="key" variant="outline" class="text-[10px]">
                  {{ key }}: {{ typeof val === 'number' ? formatMs(val) : val }}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Insights pack -->
      <Card v-if="insightsReport?.insights?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">
            Performance Insights
            <Badge variant="secondary" class="ml-2 text-xs">{{ insightsReport.insights.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <div v-for="insight in insightsReport.insights" :key="insight.id" class="p-3 border rounded-lg">
              <div class="flex items-center justify-between">
                <div class="text-sm font-medium">{{ insight.title || insight.id }}</div>
                <Badge variant="outline" class="text-xs">{{ insight.routeCount }} routes</Badge>
              </div>
              <div class="flex gap-1 mt-2 flex-wrap">
                <Badge v-for="(val, key) in insight.totalSavings" :key="key" variant="secondary" class="text-[10px]">
                  {{ key }}: {{ typeof val === 'number' ? formatMs(val) : val }}
                </Badge>
              </div>
              <div v-if="insight.worstRoutes?.length" class="mt-2 text-xs text-muted-foreground">
                Worst: <span v-for="(wr, i) in insight.worstRoutes.slice(0, 3)" :key="wr.url" class="font-mono">{{ wr.url }}{{ i < Math.min(insight.worstRoutes.length, 3) - 1 ? ', ' : '' }}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Route Scores -->
      <Card v-if="routeScores?.items?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Route Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Path</TableHead>
                <TableHead class="w-20 text-right">Score</TableHead>
                <TableHead class="w-24 text-right">LCP</TableHead>
                <TableHead class="w-20 text-right">CLS</TableHead>
                <TableHead class="w-24 text-right">TBT</TableHead>
                <TableHead class="w-24 text-right">INP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="r in routeScores.items.slice(0, 50)" :key="r.url">
                <TableCell class="font-mono text-xs truncate max-w-sm">{{ r.path }}</TableCell>
                <TableCell class="text-right tabular-nums font-bold" :class="scoreToColor(r.scorePerformance)">{{ scoreToLabel(r.scorePerformance) }}</TableCell>
                <TableCell class="text-right tabular-nums text-xs">{{ r.lcp != null ? formatMs(r.lcp) : '—' }}</TableCell>
                <TableCell class="text-right tabular-nums text-xs">{{ r.cls?.toFixed(3) ?? '—' }}</TableCell>
                <TableCell class="text-right tabular-nums text-xs">{{ r.tbt != null ? formatMs(r.tbt) : '—' }}</TableCell>
                <TableCell class="text-right tabular-nums text-xs">{{ r.inp != null ? formatMs(r.inp) : '—' }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div v-if="!cwvReport && !insightsReport" class="text-center py-12 text-muted-foreground">
        No performance data available. Run a scan first.
      </div>
    </template>
  </div>
</template>
