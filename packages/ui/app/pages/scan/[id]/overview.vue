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
import { useScanStore } from '~/stores/scan'

const route = useRoute()
const api = useApi()
const store = useScanStore()
const scanId = computed(() => route.params.id as string)

const { scoreToColor, scoreToLabel, scoreToRingColor } = useScoreColor()

const { data: scanMeta } = useAsyncData(
  `scan-meta-${scanId.value}`,
  () => api['scan.meta']({ scanId: scanId.value }).catch(() => null),
  { watch: [scanId] },
)

const isCurrentScan = computed(() => store.scanId === scanId.value)
const currentScanIsActive = computed(() => isCurrentScan.value && store.isActive)

const resolvedStatus = computed(() => {
  if (scanMeta.value?.summary) return 'complete'
  if (isCurrentScan.value) return store.status
  return 'complete'
})

const scanIsComplete = computed(() => resolvedStatus.value === 'complete')

const { data: scanSummary, refresh: refreshSummary } = useAsyncData(
  `scan-summary-${scanId.value}`,
  () => {
    if (!scanIsComplete.value) return Promise.resolve(null)
    return api['scan.summary']({ scanId: scanId.value }).catch(() => null)
  },
  { watch: [scanId, scanIsComplete] },
)

const { $ws } = useNuxtApp()
const ws = $ws as { on: (e: string, fn: (d: any) => void) => void, off: (e: string, fn: (d: any) => void) => void }

onMounted(() => ws.on('scan:complete', refreshSummary))
onUnmounted(() => ws.off('scan:complete', refreshSummary))

const categoryCards = computed(() => {
  if (!scanSummary.value?.categoryAverages) return []
  const categories = [
    { key: 'performance', label: 'Performance', icon: 'lucide:gauge', path: 'performance' },
    { key: 'accessibility', label: 'Accessibility', icon: 'lucide:accessibility', path: 'accessibility' },
    { key: 'seo', label: 'SEO', icon: 'lucide:search', path: 'seo' },
    { key: 'best-practices', label: 'Best Practices', icon: 'lucide:shield-check', path: 'best-practices' },
  ]
  return categories.map(cat => ({
    ...cat,
    score: (scanSummary.value!.categoryAverages as Record<string, number | null>)[cat.key] ?? null,
    to: `/scan/${scanId.value}/${cat.path}`,
  }))
})

const navCards = [
  { label: 'All Routes', description: 'Browse all scanned pages with scores and metrics', icon: 'lucide:route', path: 'routes' },
  { label: 'Compare', description: 'Compare this scan against a previous run', icon: 'lucide:git-compare-arrows', path: 'compare' },
]
</script>

<template>
  <div class="space-y-6">
    <!-- Site info + status -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold tracking-tight truncate max-w-lg">
          {{ scanMeta?.site || store.site || 'Scan' }}
        </h1>
        <div class="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          <ScanStatusBadge :status="resolvedStatus" />
          <Badge v-if="scanMeta?.device" variant="outline" class="text-xs">{{ scanMeta.device }}</Badge>
          <span v-if="scanMeta?.startedAt" class="text-xs">{{ new Date(scanMeta.startedAt).toLocaleString() }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <ScanActions v-if="currentScanIsActive || store.status === 'paused'" />
        <Button v-if="scanIsComplete && !currentScanIsActive" variant="outline" size="sm" :disabled="rescanningAll" @click="handleRescanAll">
          <Icon v-if="rescanningAll" name="lucide:loader-2" class="size-4 mr-1 animate-spin" />
          <Icon v-else name="lucide:refresh-cw" class="size-4 mr-1" />
          Rescan All
        </Button>
      </div>
    </div>

    <!-- Active scan progress -->
    <ScanProgress v-if="currentScanIsActive" />

    <!-- Category score cards (clickable -> detail pages) -->
    <div v-if="categoryCards.length" class="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <NuxtLink
        v-for="card in categoryCards"
        :key="card.key"
        :to="card.to"
        class="group"
      >
        <Card class="transition-all hover:border-primary/50 hover:shadow-sm group-hover:bg-muted/30">
          <CardContent class="pt-5 pb-4">
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-medium text-muted-foreground">{{ card.label }}</span>
              <Icon :name="card.icon" class="size-4 text-muted-foreground/60" />
            </div>
            <div class="flex items-center gap-3">
              <ScoreRing :score="card.score" size="sm" />
              <span class="text-3xl font-bold tabular-nums" :style="{ color: scoreToRingColor(card.score) }">
                {{ scoreToLabel(card.score) }}
              </span>
            </div>
            <div class="mt-2 text-xs text-muted-foreground flex items-center gap-1">
              View details
              <Icon name="lucide:arrow-right" class="size-3 transition-transform group-hover:translate-x-0.5" />
            </div>
          </CardContent>
        </Card>
      </NuxtLink>
    </div>

    <div v-if="scanSummary" class="grid gap-4 lg:grid-cols-2">
      <!-- Score Distribution -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-2.5">
            <div class="flex items-center gap-3">
              <div class="w-20 text-sm">Passing</div>
              <div class="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  class="bg-green-500 h-full rounded-full transition-all"
                  :style="{ width: `${scanSummary.routesScanned ? (scanSummary.distribution.passing / scanSummary.routesScanned) * 100 : 0}%` }"
                />
              </div>
              <span class="text-sm font-medium tabular-nums w-6 text-right">{{ scanSummary.distribution.passing }}</span>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-20 text-sm">Needs Work</div>
              <div class="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  class="bg-orange-500 h-full rounded-full transition-all"
                  :style="{ width: `${scanSummary.routesScanned ? (scanSummary.distribution.needsWork / scanSummary.routesScanned) * 100 : 0}%` }"
                />
              </div>
              <span class="text-sm font-medium tabular-nums w-6 text-right">{{ scanSummary.distribution.needsWork }}</span>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-20 text-sm">Poor</div>
              <div class="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  class="bg-red-500 h-full rounded-full transition-all"
                  :style="{ width: `${scanSummary.routesScanned ? (scanSummary.distribution.poor / scanSummary.routesScanned) * 100 : 0}%` }"
                />
              </div>
              <span class="text-sm font-medium tabular-nums w-6 text-right">{{ scanSummary.distribution.poor }}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Summary -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-2xl font-bold tabular-nums">{{ scanSummary.routesScanned }}</div>
              <div class="text-xs text-muted-foreground">Routes Scanned</div>
            </div>
            <div>
              <div class="text-2xl font-bold tabular-nums" :class="scoreToColor(scanSummary.avgScore)">
                {{ scoreToLabel(scanSummary.avgScore) }}
              </div>
              <div class="text-xs text-muted-foreground">Average Score</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Navigation cards -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="nav in navCards"
        :key="nav.path"
        :to="`/scan/${scanId}/${nav.path}`"
        class="group"
      >
        <Card class="transition-all hover:border-primary/50 hover:shadow-sm group-hover:bg-muted/30">
          <CardContent class="pt-5 pb-4 flex items-center gap-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Icon :name="nav.icon" class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm">{{ nav.label }}</div>
              <div class="text-xs text-muted-foreground">{{ nav.description }}</div>
            </div>
            <Icon name="lucide:chevron-right" class="size-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
          </CardContent>
        </Card>
      </NuxtLink>
    </div>

    <!-- Worst Routes -->
    <Card v-if="scanSummary?.worstRoutes?.length">
      <CardHeader class="pb-3">
        <CardTitle class="text-sm font-medium text-muted-foreground">Worst Routes</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead class="w-24 text-right">Score</TableHead>
              <TableHead class="w-32">Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="r in scanSummary.worstRoutes" :key="r.url">
              <TableCell class="font-mono text-xs truncate max-w-md">{{ r.url }}</TableCell>
              <TableCell class="text-right">
                <span class="font-bold tabular-nums" :class="scoreToColor(r.score)">
                  {{ scoreToLabel(r.score) }}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" class="text-xs capitalize">{{ r.category || '—' }}</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Loading -->
    <div v-if="!scanSummary && !currentScanIsActive" class="py-12 text-center text-muted-foreground">
      <p v-if="scanIsComplete">Loading results...</p>
      <p v-else>Scan in progress or not found.</p>
    </div>
  </div>
</template>
