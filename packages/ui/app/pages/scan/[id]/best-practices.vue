<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

const { data: bundlePack, status } = useAsyncData(
  `bp-bundle-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'js-bundle' }).catch(() => null),
)

const { data: routeScores } = useAsyncData(
  `bp-routes-${scanId}`,
  () => api['scan.results']({ scanId, page: 1, pageSize: 200, sort: 'score-asc' }).catch(() => null),
)

const bundleReport = computed(() => (bundlePack.value as any)?.report ?? null)
</script>

<template>
  <div class="space-y-6">
    <ScanNav />
    <h1 class="text-xl font-bold tracking-tight">Best Practices</h1>

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">
      Loading best practices data...
    </div>

    <template v-else>
      <!-- JS Bundle Analysis -->
      <Card v-if="bundleReport?.findings?.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            JS Bundle Issues
            <Badge variant="secondary" class="text-xs">{{ bundleReport.findings.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <div v-for="finding in bundleReport.findings" :key="finding.auditId" class="p-3 border rounded-lg">
              <div class="flex items-center justify-between">
                <div class="text-sm font-medium">{{ finding.title || finding.auditId }}</div>
                <Badge variant="outline" class="text-xs">{{ finding.routeCount }} routes</Badge>
              </div>
              <div v-if="finding.totalWastedBytes" class="text-xs text-orange-500 mt-1">
                {{ (finding.totalWastedBytes / 1024).toFixed(0) }}KB total wasted
              </div>
              <div v-if="finding.worstRoutes?.length" class="mt-2 text-xs text-muted-foreground font-mono">
                <span v-for="(r, i) in finding.worstRoutes.slice(0, 3)" :key="r">{{ r }}{{ i < 2 ? ', ' : '' }}</span>
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
                <TableHead class="w-28 text-right">Best Practices</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="r in routeScores.items.slice(0, 50)" :key="r.url">
                <TableCell class="font-mono text-xs truncate max-w-sm">{{ r.path }}</TableCell>
                <TableCell class="text-right tabular-nums font-bold" :class="scoreToColor(r.scoreBestPractices)">
                  {{ scoreToLabel(r.scoreBestPractices) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div v-if="!bundleReport && !routeScores?.items?.length" class="text-center py-12 text-muted-foreground">
        No best practices data available. Run a scan first.
      </div>
    </template>
  </div>
</template>
