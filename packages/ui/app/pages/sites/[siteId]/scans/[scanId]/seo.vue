<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

definePageMeta({ layout: 'scan' })

const api = useApi()
const scanId = getScanId()

const { data: seoPack, status } = useAsyncData(
  `seo-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'seo-basics' }).catch(() => null),
)

const report = computed(() => (seoPack.value as any)?.report ?? null)
</script>

<template>
  <CategoryPageShell
    title="SEO"
    pack="seo-basics"
    :status="status"
    :report="report"
    empty-message="No SEO data available. Run a scan first."
    loading-message="Loading SEO data..."
  >
    <!-- Indexability summary cards — SEO-specific. -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent class="pt-5 pb-4 text-center">
          <div class="numerals-display text-2xl" :class="report.indexabilityPercent === 100 ? 'text-success' : report.indexabilityPercent >= 80 ? 'text-warning' : 'text-destructive'">
            {{ report.indexabilityPercent ?? 0 }}%
          </div>
          <div class="text-xs text-muted-foreground">
            Indexability
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-5 pb-4 text-center">
          <div class="text-2xl font-bold text-success tabular-nums">
            {{ report.indexableRoutes ?? 0 }}
          </div>
          <div class="text-xs text-muted-foreground">
            Indexable Routes
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-5 pb-4 text-center">
          <div class="numerals-display text-2xl" :class="report.unindexableRoutes > 0 ? 'text-destructive' : 'text-success'">
            {{ report.unindexableRoutes ?? 0 }}
          </div>
          <div class="text-xs text-muted-foreground">
            Unindexable Routes
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-5 pb-4 text-center">
          <div class="numerals-display text-2xl">
            {{ report.routesAnalysed ?? 0 }}
          </div>
          <div class="text-xs text-muted-foreground">
            Routes Analysed
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Findings via the shared accordion. -->
    <PackFindings :findings="report.findings ?? []" title="SEO Issues" />

    <!-- Per-route checks table (SEO-specific again). -->
    <Card v-if="report.routeChecks?.length">
      <CardHeader class="pb-3">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          Route Checks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead class="w-20 text-right">
                Passes
              </TableHead>
              <TableHead class="w-20 text-right">
                Fails
              </TableHead>
              <TableHead class="w-20">
                Indexable
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="rc in report.routeChecks" :key="rc.url">
              <TableCell class="font-mono text-xs truncate max-w-sm" :title="rc.url">
                {{ rc.url }}
              </TableCell>
              <TableCell class="text-right tabular-nums text-success">
                {{ rc.passes }}
              </TableCell>
              <TableCell class="text-right tabular-nums" :class="rc.fails > 0 ? 'text-destructive' : ''">
                {{ rc.fails }}
              </TableCell>
              <TableCell>
                <Icon
                  :name="rc.indexable ? 'lucide:check-circle' : 'lucide:x-circle'"
                  :class="rc.indexable ? 'text-success' : 'text-destructive'"
                  class="size-4"
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <div v-if="!report.findings?.length && !report.routeChecks?.length" class="text-center py-12 text-muted-foreground">
      No SEO issues found.
    </div>
  </CategoryPageShell>
</template>
