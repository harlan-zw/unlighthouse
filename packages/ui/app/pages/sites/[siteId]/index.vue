<script setup lang="ts">
import type { TrendSeries } from '@/components/TrendChart.vue'
import type { DevicePair, ScanRow } from '@/components/site/types'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

definePageMeta({ layout: 'site' })

const route = useRoute()
const router = useRouter()
const api = useApi()
const slug = route.params.siteId as string

// Shared key with AppSidebar's sites fetch so we don't double-load.
const { data: sitesData } = useAsyncData(
  'sidebar-sites',
  () => api['sites.list']({}).catch(() => ({ sites: [] as Array<{ id: string, name: string, url: string, group: string | null }> })),
)
const siteMeta = computed(() => (sitesData.value?.sites ?? []).find(s => siteSlug(s.url) === slug) ?? null)
const siteUrl = computed(() => resolveSiteUrl(slug, sitesData.value?.sites ?? []))
const siteName = computed(() => siteMeta.value?.name || slug)

// Scans store `site` as the exact scanned URL (per page), so history.list's
// site filter is too narrow to gather a whole domain. Fetch the recent scans
// once (shared key with /history) and group by origin client-side — the same
// approach history.vue uses.
const { data: histData, status: histStatus } = useAsyncData(
  'scan-history-grouped',
  () => api['history.list']({ page: 1, pageSize: 200 }).catch(() => null),
)

const siteOrigin = computed(() => {
  try {
    return new URL(siteUrl.value).origin
  }
  catch {
    return siteUrl.value
  }
})
const allScans = computed(() => ((histData.value?.items ?? []) as ScanRow[]).filter((s) => {
  try {
    return new URL(s.site).origin === siteOrigin.value
  }
  catch {
    return false
  }
}))
const presentDevices = computed(() => new Set(allScans.value.map(s => s.device)))
const hasBoth = computed(() => presentDevices.value.has('mobile') && presentDevices.value.has('desktop'))

const deviceFilter = ref<'mobile' | 'desktop'>('mobile')
const effectiveDevice = computed<'mobile' | 'desktop'>(() => {
  if (presentDevices.value.has(deviceFilter.value))
    return deviceFilter.value
  return presentDevices.value.has('mobile') ? 'mobile' : 'desktop'
})

// Completed, scored scans for the active device, oldest→newest, capped to the
// most recent 30 so the trend (and the per-scan vitals fetch) stays bounded.
const trendScans = computed(() =>
  allScans.value
    .filter(s => s.device === effectiveDevice.value && s.summary && (s.summary.completed ?? 0) > 0)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(-30),
)

// ── Score trend (free, from scan summaries) ─────────────────────────────────
const SCORE_SERIES = [
  { key: 'performance', label: 'Performance', color: '#f97316' },
  { key: 'accessibility', label: 'Accessibility', color: '#3b82f6' },
  { key: 'seo', label: 'SEO', color: '#a855f7' },
  { key: 'best-practices', label: 'Best Practices', color: '#22c55e' },
] as const

const scoreSeries = computed<TrendSeries[]>(() => SCORE_SERIES.map(c => ({
  label: c.label,
  color: c.color,
  points: trendScans.value.map((s) => {
    const raw = (s.summary?.scoresByCategory as Record<string, number | undefined> | undefined)?.[c.key]
    return { t: new Date(s.startedAt).getTime(), v: raw == null ? null : Math.round(raw * 100) }
  }),
})))

// ── Web-vitals trend (eager: one cached cwv pack per scan) ──────────────────
const VITALS = [
  { key: 'lcp', label: 'LCP', color: '#6366f1', fmt: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`) },
  { key: 'cls', label: 'CLS', color: '#8b5cf6', fmt: (v: number) => v.toFixed(3) },
  { key: 'tbt', label: 'TBT', color: '#ec4899', fmt: (v: number) => `${Math.round(v)}ms` },
] as const

const { data: vitalsData, status: vitalsStatus } = useAsyncData(
  `site-vitals-${slug}`,
  async () => {
    const list = trendScans.value
    if (!list.length)
      return [] as Array<{ t: number, report: any }>
    const res = await Promise.all(list.map(s =>
      api['pack.run']({ scanId: s.scanId, pack: 'cwv' })
        .then((r: any) => ({ t: new Date(s.startedAt).getTime(), report: r?.report }))
        .catch(() => null),
    ))
    return res.filter(Boolean) as Array<{ t: number, report: any }>
  },
  { watch: [trendScans] },
)

function vitalsSeries(metricKey: string, label: string, color: string): TrendSeries[] {
  return [{
    label,
    color,
    points: (vitalsData.value ?? []).map((d) => {
      const m = (d.report?.metrics as Array<{ metric: string, p75: number | null }> | undefined)?.find(x => x.metric === metricKey)
      return { t: d.t, v: m?.p75 ?? null }
    }),
  }]
}

// ── Scan history table ──────────────────────────────────────────────────────
const pairs = computed<DevicePair[]>(() => pairScans(allScans.value))

function primaryScanId(pair: DevicePair): string {
  return pair.mobile?.scanId ?? pair.desktop?.scanId ?? ''
}
function openPair(pair: DevicePair) {
  const id = primaryScanId(pair)
  if (id)
    router.push(`/scan/${id}/overview`)
}
async function rescan(scanId: string) {
  if (!scanId)
    return
  try {
    const result = await api['history.rescan']({ scanId: scanId as any })
    toast.success('Rescan started')
    router.push(`/scan/${result.scanId}/overview`)
  }
  catch (err: any) {
    toast.error('Rescan failed', { description: err.message })
  }
}
async function deleteScan(scanId: string) {
  if (!scanId)
    return
  try {
    await api['scan.delete']({ scanId: scanId as any })
    toast.success('Scan deleted')
  }
  catch (err: any) {
    toast.error('Failed to delete', { description: err.message })
  }
}

// ── Compare latest two (same device) ────────────────────────────────────────
const recentForDevice = computed(() =>
  allScans.value
    .filter(s => s.device === effectiveDevice.value && s.summary && (s.summary.completed ?? 0) > 0)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
)
const canCompare = computed(() => recentForDevice.value.length >= 2)
function compareLatest() {
  const [current, base] = recentForDevice.value
  if (current && base)
    router.push(`/compare/${current.scanId}?base=${base.scanId}`)
}

const loading = computed(() => histStatus.value === 'pending')
const isEmpty = computed(() => !loading.value && allScans.value.length === 0)
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold tracking-tight truncate">{{ siteName }}</h1>
        <a :href="siteUrl" target="_blank" rel="noopener" class="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          {{ siteUrl }}
          <Icon name="lucide:external-link" class="size-3" />
        </a>
      </div>
      <div class="flex items-center gap-2">
        <Button v-if="canCompare" variant="outline" size="sm" @click="compareLatest">
          <Icon name="lucide:git-compare" class="size-4 mr-1.5" />
          Compare latest two
        </Button>
        <Button size="sm" as-child>
          <NuxtLink :to="`/scan/new?url=${encodeURIComponent(siteUrl)}`">
            <Icon name="lucide:plus" class="size-4 mr-1.5" />
            New Scan
          </NuxtLink>
        </Button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-16 text-muted-foreground">Loading site history…</div>

    <div v-else-if="isEmpty" class="text-center py-16 text-muted-foreground">
      <Icon name="lucide:radar" class="size-10 mx-auto mb-3 opacity-50" />
      <p>No scans yet for this site.</p>
      <Button size="sm" class="mt-4" as-child>
        <NuxtLink :to="`/scan/new?url=${encodeURIComponent(siteUrl)}`">Start the first scan</NuxtLink>
      </Button>
    </div>

    <template v-else>
      <!-- Device toggle -->
      <div v-if="hasBoth" class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground">Trends for</span>
        <ToggleGroup v-model="deviceFilter" type="single" size="sm" variant="outline">
          <ToggleGroupItem value="mobile" class="text-xs">
            <Icon name="lucide:smartphone" class="size-3.5 mr-1" /> Mobile
          </ToggleGroupItem>
          <ToggleGroupItem value="desktop" class="text-xs">
            <Icon name="lucide:monitor" class="size-3.5 mr-1" /> Desktop
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <!-- Score trend -->
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">Category scores over time</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart :series="scoreSeries" :y-min="0" :y-max="100" :height="220" />
        </CardContent>
      </Card>

      <!-- Web vitals trend -->
      <Card>
        <CardHeader class="pb-2 flex flex-row items-center justify-between">
          <CardTitle class="text-sm font-medium text-muted-foreground">Core Web Vitals (p75) over time</CardTitle>
          <span v-if="vitalsStatus === 'pending'" class="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Icon name="lucide:loader-2" class="size-3.5 animate-spin" /> loading vitals…
          </span>
        </CardHeader>
        <CardContent>
          <div class="grid gap-6 lg:grid-cols-3">
            <div v-for="m in VITALS" :key="m.key">
              <div class="text-xs font-medium mb-1" :style="{ color: m.color }">{{ m.label }}</div>
              <TrendChart
                :series="vitalsSeries(m.key, m.label, m.color)"
                :format="m.fmt"
                :show-legend="false"
                :height="140"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Scan history -->
      <div>
        <h2 class="text-sm font-medium text-muted-foreground mb-3">Scan history</h2>
        <SiteHistoryTable
          :pairs="pairs"
          @open="openPair"
          @rescan="rescan"
          @delete="deleteScan"
        />
      </div>
    </template>
  </div>
</template>
