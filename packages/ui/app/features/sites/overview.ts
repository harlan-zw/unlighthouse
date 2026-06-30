import type { ScanId } from '@unlighthouse/contracts'
import type { TrendMarker, TrendSeries } from '~/features/sites/components/TrendChart.vue'
import type { DevicePair, ScanRow } from '~/features/sites/scan-pairs'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { scanLinkPath } from '~/features/scan/scan-links'
import { pairScans } from '~/features/sites/scan-pairs'
import { resolveSiteUrl } from '~/features/sites/site-url'
import { siteSlug } from '~/utils/site'

type SiteDevice = 'mobile' | 'desktop'

const SCORE_SERIES = [
  { key: 'performance', label: 'Performance', color: '#f97316' },
  { key: 'accessibility', label: 'Accessibility', color: '#3b82f6' },
  { key: 'seo', label: 'SEO', color: '#a855f7' },
  { key: 'best-practices', label: 'Best Practices', color: '#22c55e' },
] as const

const VITALS = [
  { key: 'lcp', label: 'LCP', color: '#6366f1', fmt: (value: number) => formatMs(value) },
  { key: 'cls', label: 'CLS', color: '#8b5cf6', fmt: (value: number) => value.toFixed(3) },
  { key: 'tbt', label: 'TBT', color: '#ec4899', fmt: (value: number) => `${Math.round(value)}ms` },
] as const

interface SiteEntry {
  url: string
  name?: string | null
}

interface CwvReportEntry {
  t: number
  report: any
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  }
  catch {
    return null
  }
}

function completedScoredScans(scans: ScanRow[], device: SiteDevice): ScanRow[] {
  return scans.filter(scan => scan.device === device && scan.summary && (scan.summary.completed ?? 0) > 0)
}

function primaryScanId(pair: DevicePair): string {
  return pair.mobile?.scanId ?? pair.desktop?.scanId ?? ''
}

export function useSiteOverview() {
  const route = useRoute()
  const router = useRouter()
  const api = useApi()
  const slug = route.params.siteId as string

  const { data: sitesData, error: sitesError } = useApiQuery('sites.list', () => ({}))

  const siteMeta = computed(() => ((sitesData.value?.sites ?? []) as SiteEntry[]).find(site => siteSlug(site.url) === slug) ?? null)
  const siteUrl = computed(() => resolveSiteUrl(slug, sitesData.value?.sites ?? []))
  const siteName = computed(() => siteMeta.value?.name || slug)

  const { data: histData, status: histStatus, error: histError, refresh: refreshHistory } = useApiQuery(
    'history.list',
    () => ({ page: 1, pageSize: 200 }),
  )

  const siteOrigin = computed(() => originOf(siteUrl.value) ?? siteUrl.value)
  const allScans = computed(() => ((histData.value?.items ?? []) as ScanRow[]).filter(scan => originOf(scan.site) === siteOrigin.value))
  const presentDevices = computed(() => new Set(allScans.value.map(scan => scan.device)))
  const hasBoth = computed(() => presentDevices.value.has('mobile') && presentDevices.value.has('desktop'))

  const deviceFilter = ref<SiteDevice>('mobile')
  const effectiveDevice = computed<SiteDevice>(() => {
    if (presentDevices.value.has(deviceFilter.value))
      return deviceFilter.value
    return presentDevices.value.has('mobile') ? 'mobile' : 'desktop'
  })

  const trendScans = computed(() =>
    completedScoredScans(allScans.value, effectiveDevice.value)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .slice(-30),
  )

  const showReleases = ref(true)
  const releaseMarkers = computed<TrendMarker[]>(() => {
    const markers: TrendMarker[] = []
    let prevCommit: string | null = null
    for (const scan of trendScans.value) {
      const commit = scan.ciCommit
      if (commit && commit !== prevCommit) {
        markers.push({
          t: new Date(scan.startedAt).getTime(),
          label: commit.slice(0, 7),
          title: [scan.ciBranch, commit.slice(0, 7), scan.ciCommitMessage].filter(Boolean).join(' · '),
        })
      }
      if (commit)
        prevCommit = commit
    }
    return markers
  })
  const hasReleases = computed(() => releaseMarkers.value.length > 0)

  const scoreSeries = computed<TrendSeries[]>(() => SCORE_SERIES.map(series => ({
    label: series.label,
    color: series.color,
    points: trendScans.value.map((scan) => {
      const raw = (scan.summary?.scoresByCategory as Record<string, number | undefined> | undefined)?.[series.key]
      return { t: new Date(scan.startedAt).getTime(), v: raw == null ? null : Math.round(raw * 100) }
    }),
  })))

  // Composite: one `pack.run` per trend scan, fanned out. Per-scan `.catch`
  // drops a scan whose pack failed rather than failing the whole chart — an
  // expected, ignorable gap — so this stays a handler query. Keyed on the
  // scan-id set so it refetches when the trend window changes.
  const { data: vitalsData, status: vitalsStatus } = useNuxtAsyncQuery<CwvReportEntry[]>(
    async () => {
      const scans = trendScans.value
      if (!scans.length)
        return [] as CwvReportEntry[]
      const results = await Promise.all(scans.map(scan =>
        api['pack.run']({ scanId: scan.scanId, pack: 'cwv' })
          .then((result: any) => ({ t: new Date(scan.startedAt).getTime(), report: result?.report }))
          .catch(() => null),
      ))
      return results.filter(Boolean) as CwvReportEntry[]
    },
    { key: () => `site-vitals:${slug}:${trendScans.value.map(scan => scan.scanId).join(',')}` },
  )

  function vitalsSeries(metricKey: string, label: string, color: string): TrendSeries[] {
    return [{
      label,
      color,
      points: (vitalsData.value ?? []).map((entry) => {
        const metric = (entry.report?.metrics as Array<{ metric: string, p75: number | null }> | undefined)?.find(item => item.metric === metricKey)
        return { t: entry.t, v: metric?.p75 ?? null }
      }),
    }]
  }

  const pairs = computed<DevicePair[]>(() => pairScans(allScans.value))

  function openPair(pair: DevicePair) {
    const id = primaryScanId(pair)
    if (id)
      router.push(scanLinkPath(slug, id, pair.mobile?.status ?? pair.desktop?.status))
  }

  const rescanMutation = useApiMutation('history.rescan')
  async function rescan(scanId: string) {
    if (!scanId)
      return
    const result = await rescanMutation.mutateSafe({ scanId: scanId as ScanId })
    if (result._tag === 'err') {
      toast.error('Rescan failed', { description: normalizeApiError(result.error).message })
      return
    }
    toast.success('Rescan started')
    router.push(`/sites/${slug}/scans/${result.data.scanId}/overview`)
  }

  const deleteMutation = useApiMutation('scan.delete', { invalidates: ['history.list'] })
  async function deleteScan(scanId: string) {
    if (!scanId)
      return
    const result = await deleteMutation.mutateSafe({ scanId: scanId as ScanId })
    if (result._tag === 'err') {
      toast.error('Failed to delete', { description: normalizeApiError(result.error).message })
      return
    }
    toast.success('Scan deleted')
  }

  const recentForDevice = computed(() =>
    completedScoredScans(allScans.value, effectiveDevice.value)
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

  return {
    slug,
    siteUrl,
    siteName,
    sitesError,
    histError,
    refreshHistory,
    hasBoth,
    deviceFilter,
    showReleases,
    releaseMarkers,
    hasReleases,
    scoreSeries,
    vitalsStatus,
    vitals: VITALS,
    vitalsSeries,
    pairs,
    openPair,
    rescan,
    deleteScan,
    canCompare,
    compareLatest,
    loading,
    isEmpty,
  }
}
