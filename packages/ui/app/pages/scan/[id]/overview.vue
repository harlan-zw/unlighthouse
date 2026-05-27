<script setup lang="ts">
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
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import { toast } from 'vue-sonner'
import { useScanStore } from '~/stores/scan'

const route = useRoute()
const router = useRouter()
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

// Device filter for the summary view. Defaults to "all" — the dashboard
// shows both devices' aggregated avg by default. Switching narrows the
// summary + worst-routes table to the picked device's rows. Persisted only
// for this session (component-local); a scan link from elsewhere always
// lands on "all" so screenshots / shares show the same numbers everyone
// else sees.
const deviceFilter = ref<'' | 'mobile' | 'desktop'>('')

// Probe whether the scan actually has both devices. Skip the toggle for
// single-device scans so we don't suggest a filter that produces an empty
// summary. pageSize=1 + total is the cheapest signal.
const { data: deviceProbe } = useAsyncData(
  `scan-devices-${scanId.value}`,
  async () => {
    if (!scanIsComplete.value) return null
    const [mob, desk] = await Promise.all([
      api['scan.results']({ scanId: scanId.value, device: 'mobile', pageSize: 1 }).catch(() => ({ total: 0 } as any)),
      api['scan.results']({ scanId: scanId.value, device: 'desktop', pageSize: 1 }).catch(() => ({ total: 0 } as any)),
    ])
    return { mobile: (mob.total ?? 0) > 0, desktop: (desk.total ?? 0) > 0 }
  },
  { watch: [scanId, scanIsComplete] },
)

const hasMultipleDevices = computed(() => Boolean(deviceProbe.value?.mobile && deviceProbe.value?.desktop))

const { data: scanSummary, refresh: refreshSummary } = useAsyncData(
  `scan-summary-${scanId.value}`,
  () => {
    if (!scanIsComplete.value) return Promise.resolve(null)
    return api['scan.summary']({
      scanId: scanId.value,
      device: deviceFilter.value || undefined,
    }).catch(() => null)
  },
  { watch: [scanId, scanIsComplete, deviceFilter] },
)

const { $ws } = useNuxtApp()
const ws = $ws as { on: (e: string, fn: (d: any) => void) => void, off: (e: string, fn: (d: any) => void) => void }

onMounted(() => ws.on('scan:complete', refreshSummary))
onUnmounted(() => ws.off('scan:complete', refreshSummary))

const rescanningAll = ref(false)
async function handleRescanAll() {
  rescanningAll.value = true
  try {
    const result = await api['scan.rescanAll']({ scanId: scanId.value })
    toast.success('Rescan started')
    router.push(`/scan/${result.scanId}/overview`)
  }
  catch (err: any) {
    toast.error('Rescan failed', { description: err.message })
  }
  finally {
    rescanningAll.value = false
  }
}

const categories = computed(() => {
  const avgs = (scanSummary.value?.categoryAverages ?? {}) as Record<string, number | null>
  return [
    { key: 'performance', label: 'Performance', icon: 'lucide:gauge', path: 'performance', score: avgs['performance'] ?? null },
    { key: 'seo', label: 'SEO', icon: 'lucide:search', path: 'seo', score: avgs['seo'] ?? null },
    { key: 'accessibility', label: 'Accessibility', icon: 'lucide:accessibility', path: 'accessibility', score: avgs['accessibility'] ?? null },
    { key: 'best-practices', label: 'Best Practices', icon: 'lucide:shield-check', path: 'best-practices', score: avgs['best-practices'] ?? null },
    { key: 'agentic-browsing', label: 'Agentic', icon: 'lucide:bot', path: 'agentic-browsing', score: avgs['agentic-browsing'] ?? null },
  ]
})

const tools = [
  { label: 'All Routes', description: 'Browse all scanned pages', icon: 'lucide:route', path: 'routes' },
  { label: 'Compare', description: 'Compare against previous scan', icon: 'lucide:git-compare-arrows', path: 'compare' },
  { label: 'CrUX Field Data', description: 'Real-world Chrome UX metrics', icon: 'lucide:globe', path: 'crux' },
  { label: 'Event Stream', description: 'Real-time scan logs', icon: 'lucide:radio', path: 'events' },
]

const distribution = computed(() => {
  if (!scanSummary.value) return null
  const d = scanSummary.value.distribution
  const total = scanSummary.value.routesScanned || 1
  return {
    total,
    segments: [
      { label: 'Pass', count: d.passing, pct: (d.passing / total) * 100, color: '#22c55e' },
      { label: 'Needs Work', count: d.needsWork, pct: (d.needsWork / total) * 100, color: '#f97316' },
      { label: 'Poor', count: d.poor, pct: (d.poor / total) * 100, color: '#ef4444' },
    ].filter(s => s.count > 0),
  }
})

const donutArcs = computed(() => {
  if (!distribution.value) return []
  const segs = distribution.value.segments
  const total = segs.reduce((s, v) => s + v.count, 0) || 1
  const gap = 0.02
  const totalGap = gap * segs.length
  const available = 1 - totalGap
  let offset = -0.25
  return segs.map((seg) => {
    const ratio = (seg.count / total) * available
    const circumference = 2 * Math.PI * 40
    const dashLen = ratio * circumference
    const gapLen = circumference - dashLen
    const rotation = offset * 360
    offset += ratio + gap
    return { ...seg, dashLen, gapLen, rotation }
  })
})

function scoreColor(score: number | null) {
  if (score == null) return 'var(--muted-foreground)'
  return scoreToRingColor(score)
}
</script>

<template>
  <div class="space-y-8">
    <ScanNav />

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight truncate max-w-lg">
          {{ scanMeta?.site || store.site || 'Scan' }}
        </h1>
        <div class="flex items-center gap-2 mt-1.5 text-sm text-muted-foreground">
          <ScanStatusBadge :status="resolvedStatus" />
          <Badge v-if="scanMeta?.device" variant="outline" class="text-xs">
            <Icon :name="scanMeta.device === 'mobile' ? 'lucide:smartphone' : 'lucide:monitor'" class="size-2.5 mr-0.5" />
            {{ scanMeta.device }}
          </Badge>
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

    <ScanProgress v-if="currentScanIsActive" />

    <!-- Device filter (only when scan captured both) -->
    <div v-if="hasMultipleDevices && scanIsComplete" class="flex items-center gap-2">
      <span class="text-xs text-muted-foreground">View as</span>
      <ToggleGroup v-model="deviceFilter" type="single" size="sm" variant="outline">
        <ToggleGroupItem value="" class="text-xs">All</ToggleGroupItem>
        <ToggleGroupItem value="mobile" class="text-xs">
          <Icon name="lucide:smartphone" class="size-3.5 mr-1" />
          Mobile
        </ToggleGroupItem>
        <ToggleGroupItem value="desktop" class="text-xs">
          <Icon name="lucide:monitor" class="size-3.5 mr-1" />
          Desktop
        </ToggleGroupItem>
      </ToggleGroup>
    </div>

    <!-- Stats row -->
    <div v-if="scanSummary" class="flex items-center gap-8 border-b pb-6">
      <div>
        <div class="text-3xl font-bold tabular-nums">{{ scanSummary.routesScanned }}</div>
        <div class="text-xs text-muted-foreground mt-0.5">Routes</div>
      </div>
      <div>
        <div class="text-3xl font-bold tabular-nums" :class="scoreToColor(scanSummary.avgScore)">
          {{ scoreToLabel(scanSummary.avgScore) }}
        </div>
        <div class="text-xs text-muted-foreground mt-0.5">Avg Score</div>
      </div>
      <div class="flex-1 max-w-xs">
        <div class="flex h-3 rounded-full overflow-hidden">
          <div
            v-for="seg in distribution?.segments"
            :key="seg.label"
            :style="{ width: `${seg.pct}%`, backgroundColor: seg.color }"
          />
        </div>
        <div class="flex gap-3 mt-1.5 text-[11px] text-muted-foreground">
          <span v-for="seg in distribution?.segments" :key="seg.label">{{ seg.count }} {{ seg.label }}</span>
        </div>
      </div>
    </div>

    <!-- Charts row -->
    <div v-if="scanSummary" class="grid gap-6 lg:grid-cols-5">
      <!-- Category scores - horizontal bars -->
      <div class="lg:col-span-3">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Category Scores</h2>
        <div class="rounded-lg border px-5 py-4 space-y-4">
          <div v-for="cat in categories.filter(c => c.score != null)" :key="cat.key" class="flex items-center gap-3">
            <span class="text-xs text-muted-foreground w-24 shrink-0 truncate">{{ cat.label }}</span>
            <div class="flex-1 h-5 bg-muted rounded overflow-hidden">
              <div
                class="h-full rounded transition-all duration-500"
                :style="{ width: `${(cat.score ?? 0) * 100}%`, backgroundColor: scoreColor(cat.score) }"
              />
            </div>
            <span class="text-sm font-bold tabular-nums w-8 text-right" :style="{ color: scoreColor(cat.score) }">
              {{ scoreToLabel(cat.score) }}
            </span>
          </div>
          <div v-if="categories.every(c => c.score == null)" class="text-sm text-muted-foreground text-center py-4">
            No score data yet
          </div>
        </div>
      </div>

      <!-- Donut chart -->
      <div v-if="distribution" class="lg:col-span-2">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Score Distribution</h2>
        <div class="rounded-lg border px-5 py-4 flex items-center gap-6 justify-center">
          <div class="relative shrink-0">
            <svg viewBox="0 0 100 100" class="size-32">
              <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" stroke-width="10" />
              <circle
                v-for="(arc, i) in donutArcs"
                :key="i"
                cx="50" cy="50" r="40"
                fill="none"
                :stroke="arc.color"
                stroke-width="10"
                stroke-linecap="round"
                :stroke-dasharray="`${arc.dashLen} ${arc.gapLen}`"
                :transform="`rotate(${arc.rotation} 50 50)`"
                class="transition-all duration-500"
              />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-2xl font-bold tabular-nums">{{ distribution.total }}</span>
              <span class="text-[10px] text-muted-foreground">routes</span>
            </div>
          </div>
          <div class="flex flex-col gap-3">
            <div v-for="seg in distribution.segments" :key="seg.label" class="flex items-center gap-2.5">
              <span class="size-2.5 rounded-full shrink-0" :style="{ backgroundColor: seg.color }" />
              <span class="text-xs text-muted-foreground w-20">{{ seg.label }}</span>
              <span class="text-sm font-semibold tabular-nums">{{ seg.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Categories -->
    <section>
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Categories</h2>
      <div class="divide-y rounded-lg border">
        <NuxtLink
          v-for="cat in categories"
          :key="cat.key"
          :to="`/scan/${scanId}/${cat.path}`"
          class="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
        >
          <Icon :name="cat.icon" class="size-4 text-muted-foreground" />
          <span class="text-sm font-medium flex-1">{{ cat.label }}</span>
          <template v-if="cat.score != null">
            <div class="w-28 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
              <div
                class="h-full rounded-full transition-all duration-500"
                :style="{ width: `${cat.score * 100}%`, backgroundColor: scoreColor(cat.score) }"
              />
            </div>
            <span class="text-sm font-bold tabular-nums w-8 text-right" :style="{ color: scoreColor(cat.score) }">
              {{ scoreToLabel(cat.score) }}
            </span>
          </template>
          <span v-else class="text-sm text-muted-foreground/40">—</span>
          <Icon name="lucide:chevron-right" class="size-4 text-muted-foreground/50" />
        </NuxtLink>
      </div>
    </section>

    <!-- Tools -->
    <section>
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tools</h2>
      <div class="divide-y rounded-lg border">
        <NuxtLink
          v-for="tool in tools"
          :key="tool.path"
          :to="`/scan/${scanId}/${tool.path}`"
          class="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
        >
          <Icon :name="tool.icon" class="size-4 text-muted-foreground" />
          <div class="flex-1">
            <span class="text-sm font-medium">{{ tool.label }}</span>
            <span class="text-xs text-muted-foreground ml-2 hidden sm:inline">{{ tool.description }}</span>
          </div>
          <Icon name="lucide:chevron-right" class="size-4 text-muted-foreground/50" />
        </NuxtLink>
      </div>
    </section>

    <!-- Worst Routes -->
    <section v-if="scanSummary?.worstRoutes?.length">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Worst Performing Routes</h2>
      <div class="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead class="w-16 text-center">Device</TableHead>
              <TableHead class="w-24 text-right">Score</TableHead>
              <TableHead class="w-32">Weakest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="r in scanSummary.worstRoutes"
              :key="r.url"
              class="cursor-pointer hover:bg-muted/50"
              @click="navigateTo(`/scan/${scanId}/route/${encodeURIComponent(new URL(r.url).pathname)}`)"
            >
              <TableCell class="font-mono text-xs truncate max-w-md">{{ r.url }}</TableCell>
              <TableCell class="text-center">
                <Icon v-if="r.device" :name="r.device === 'mobile' ? 'lucide:smartphone' : 'lucide:monitor'" class="size-3.5 text-muted-foreground inline" />
              </TableCell>
              <TableCell class="text-right">
                <span class="font-bold tabular-nums" :class="scoreToColor(r.score)">{{ scoreToLabel(r.score) }}</span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" class="text-xs capitalize">{{ r.category || '—' }}</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>

    <!-- Loading -->
    <div v-if="!scanSummary && !currentScanIsActive" class="py-12 text-center text-muted-foreground">
      <p v-if="scanIsComplete">Loading results...</p>
      <p v-else>Scan in progress or not found.</p>
    </div>
  </div>
</template>
