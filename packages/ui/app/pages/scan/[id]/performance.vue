<script setup lang="ts">
import type { PerformanceData } from '@unlighthouse/contracts'
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useScanStore } from '~/stores/scan'

const route = useRoute()
const config = useRuntimeConfig()
const baseUrl = config.public.unlighthouseApiUrl as string
const scanId = route.params.id as string
const { scoreToColor, scoreToLabel } = useScoreColor()

const { data, status } = useAsyncData(
  `perf-${scanId}`,
  async () => {
    const res = await fetch(`${baseUrl}/dashboard/performance/${scanId}`)
    if (!res.ok) return null
    return await res.json() as PerformanceData
  },
)

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}
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

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">
      Loading performance data...
    </div>

    <div v-else-if="!data" class="text-center py-12 text-muted-foreground">
      No performance data available. Run a scan first.
    </div>

    <template v-else>
      <!-- Performance Issues -->
      <Card v-if="data.issues.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Issues
            <Badge variant="secondary" class="text-xs">{{ data.issues.length }}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" class="w-full">
            <AccordionItem v-for="issue in data.issues" :key="issue.id" :value="issue.id">
              <AccordionTrigger class="text-sm">
                <div class="flex items-center gap-3 text-left">
                  <Badge variant="outline" class="text-xs shrink-0">{{ issue.issueType }}</Badge>
                  <span class="truncate">{{ issue.url }}</span>
                  <span v-if="issue.wastedBytes" class="text-xs text-muted-foreground shrink-0">
                    {{ formatBytes(issue.wastedBytes) }} wasted
                  </span>
                  <span v-if="issue.wastedMs" class="text-xs text-orange-500 shrink-0">
                    {{ formatMs(issue.wastedMs) }}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div class="text-sm space-y-2">
                  <div v-if="issue.issueSubtype" class="text-muted-foreground">{{ issue.issueSubtype }}</div>
                  <div v-if="issue.pages.length" class="text-xs text-muted-foreground">
                    Found on {{ issue.pages.length }} page(s):
                    <ul class="mt-1 space-y-0.5 font-mono">
                      <li v-for="p in issue.pages.slice(0, 5)" :key="p">{{ p }}</li>
                      <li v-if="issue.pages.length > 5" class="text-muted-foreground/60">...and {{ issue.pages.length - 5 }} more</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <!-- Third-Party Scripts -->
      <Card v-if="data.thirdParty.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Third-Party Scripts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity</TableHead>
                <TableHead class="w-28 text-right">Total TBT</TableHead>
                <TableHead class="w-28 text-right">Avg TBT</TableHead>
                <TableHead class="w-20 text-right">Pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="tp in data.thirdParty" :key="tp.entity">
                <TableCell class="font-medium text-sm">{{ tp.entity }}</TableCell>
                <TableCell class="text-right tabular-nums text-sm">{{ formatMs(tp.totalTbt) }}</TableCell>
                <TableCell class="text-right tabular-nums text-sm">{{ formatMs(tp.avgTbt) }}</TableCell>
                <TableCell class="text-right tabular-nums text-sm">{{ tp.pageCount }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- LCP Elements -->
      <Card v-if="data.lcpElements.length">
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">LCP Elements</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Element</TableHead>
                <TableHead class="w-24">Type</TableHead>
                <TableHead class="w-28 text-right">Avg LCP</TableHead>
                <TableHead class="w-20 text-right">Pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="lcp in data.lcpElements" :key="lcp.selector">
                <TableCell class="font-mono text-xs truncate max-w-xs">{{ lcp.selector }}</TableCell>
                <TableCell><Badge variant="outline" class="text-xs">{{ lcp.elementType }}</Badge></TableCell>
                <TableCell class="text-right tabular-nums text-sm">{{ formatMs(lcp.avgLcp) }}</TableCell>
                <TableCell class="text-right tabular-nums text-sm">{{ lcp.pageCount }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Route Scores -->
      <Card v-if="data.routes.length">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="r in data.routes" :key="r.path">
                <TableCell class="font-mono text-xs truncate max-w-sm">{{ r.path }}</TableCell>
                <TableCell class="text-right tabular-nums font-bold" :class="scoreToColor(r.score)">{{ scoreToLabel(r.score) }}</TableCell>
                <TableCell class="text-right tabular-nums text-xs">{{ r.lcp != null ? formatMs(r.lcp) : '—' }}</TableCell>
                <TableCell class="text-right tabular-nums text-xs">{{ r.cls?.toFixed(3) ?? '—' }}</TableCell>
                <TableCell class="text-right tabular-nums text-xs">{{ r.tbt != null ? formatMs(r.tbt) : '—' }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div v-if="!data.issues.length && !data.thirdParty.length && !data.lcpElements.length" class="text-center py-12 text-muted-foreground">
        No performance issues found.
      </div>
    </template>
  </div>
</template>
