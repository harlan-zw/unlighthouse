import type { ScanId } from '@unlighthouse/contracts'
import type { CwvReport } from '@unlighthouse/contracts/packs'
import type { TrendMarker, TrendSeries } from '~/features/sites/components/TrendChart.vue'
import type { DevicePair, ScanRow } from '~/features/sites/scan-pairs'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { CwvReportSchema } from '@unlighthouse/contracts/packs'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { routeParamString } from '~/features/scan/route-context'
import { scanLinkPath } from '~/features/scan/scan-links'
import { devicesForScan, pairScans, scoreSummaryForDevice } from '~/features/sites/scan-pairs'
import { originOf, resolveSiteUrl } from '~/features/sites/site-url'
import { siteSlug } from '~/utils/site'

type SiteDevice = 'mobile' | 'desktop'

const SCORE_SERIES = [
  { key: 'performance', label: 'Performance', color: presetVizColors.orange.hex },
  { key: 'accessibility', label: 'Accessibility', color: semanticColors.info.hex },
  { key: 'seo', label: 'SEO', color: presetVizColors.purple.hex },
  { key: 'best-practices', label: 'Best Practices', color: semanticColors.success.hex },
  { key: 'agentic-browsing', label: 'Agentic', color: presetVizColors.cyan.hex },
] as const

const VITALS = [
  { key: 'lcp', label: 'LCP', color: cwvMetricColors.lcp.hex, fmt: (value: number) => formatMs(value) },
  { key: 'cls', label: 'CLS', color: cwvMetricColors.cls.hex, fmt: (value: number) => formatMetricValue(value, '') },
  { key: 'tbt', label: 'TBT', color: cwvMetricColors.tbt.hex, fmt: (value: number) => formatMs(value) },
] as const

interface CwvReportEntry {
  t: number
  report: CwvReport
}

function completedScoredScans(scans: ScanRow[], device: SiteDevice): ScanRow[] {
  return scans.filter(scan => devicesForScan(scan).includes(device) && scan.summary && (scan.summary.completed ?? 0) > 0)
}

function primaryScanId(pair: DevicePair): ScanId | undefined {
  return pair.mobile?.scanId ?? pair.desktop?.scanId
}

export function useSiteOverview() {
  const route = useRoute()
  const router = useRouter()
  const api = useApi()
  const slug = routeParamString(route.params.siteId) ?? ''

  const { data: sitesData, error: sitesError } = useApiQuery('sites.list', () => ({}))

  const siteMeta = computed(() => (sitesData.value?.sites ?? []).find(site => siteSlug(site.url) === slug) ?? null)
  const siteUrl = computed(() => resolveSiteUrl(slug, sitesData.value?.sites ?? []))
  const siteName = computed(() => siteMeta.value?.name || slug)

  const { data: histData, status: histStatus, error: histError, refresh: refreshHistory } = useApiQuery(
    'history.list',
    () => ({ page: 1, pageSize: 200 }),
  )

  // `siteUrl` (registry lookup) is best-effort and falls back to a lossy
  // `https://{slug}` guess when unregistered — fine for display/rescan
  // prefill, but too lossy to gate scan filtering (drops scheme for http /
  // unregistered sites). Prefer the origin off an
  // actual history row sharing this slug — it carries the real scanned URL.
  const siteOrigin = computed(() => {
    const fromHistory = (histData.value?.items ?? []).find(scan => siteSlug(scan.site) === slug)
    if (fromHistory)
      return originOf(fromHistory.site) ?? fromHistory.site
    return originOf(siteUrl.value) ?? siteUrl.value
  })
  const allScans = computed(() => (histData.value?.items ?? []).filter(scan => originOf(scan.site) === siteOrigin.value))
  const presentDevices = computed(() => new Set(allScans.value.flatMap(devicesForScan)))
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
      const raw = scoreSummaryForDevice(scan, effectiveDevice.value)?.scoresByCategory[series.key]
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
        return []
      const results = await Promise.all(scans.map(scan =>
        api['pack.run']({ scanId: scan.scanId, pack: 'cwv', device: effectiveDevice.value })
          .then(result => ({ t: new Date(scan.startedAt).getTime(), report: CwvReportSchema.parse(result.report) }))
          .catch((err) => {
            logOperationalWarn('ui.optional_api_read_failed', err, {
              command: 'pack.run',
              feature: 'sites-overview',
              scanId: scan.scanId,
              pack: 'cwv',
            }, console)
            return null
          }),
      ))
      return results.filter((entry): entry is CwvReportEntry => entry !== null)
    },
    { key: () => `site-vitals:${slug}:${effectiveDevice.value}:${trendScans.value.map(scan => scan.scanId).join(',')}` },
  )

  function vitalsSeries(metricKey: string, label: string, color: string): TrendSeries[] {
    return [{
      label,
      color,
      points: (vitalsData.value ?? []).map((entry) => {
        const metric = entry.report.metrics.find(item => item.metric === metricKey)
        return { t: entry.t, v: metric?.p75 ?? null }
      }),
    }]
  }

  const pairs = computed<DevicePair[]>(() => pairScans(allScans.value))

  function openPair(pair: DevicePair) {
    const id = primaryScanId(pair)
    if (id)
      router.push(scanLinkPath(slug, id))
  }

  const rescanMutation = useApiMutation('history.rescan')
  async function rescan(scanId: ScanId) {
    const result = await rescanMutation.mutateSafe({ scanId })
    if (result._tag === 'err') {
      toast.error('Site rescan failed', { description: `${normalizeApiError(result.error).message}. Check the scan host and retry.` })
      return
    }
    toast.success('Rescan started')
    router.push(`/sites/${slug}/scans/${result.data.scanId}/overview`)
  }

  const deleteMutation = useApiMutation('scan.delete', { invalidates: ['history.list'] })
  async function deleteScan(scanId: ScanId) {
    const result = await deleteMutation.mutateSafe({ scanId })
    if (result._tag === 'err') {
      toast.error('Scan delete failed', { description: `${normalizeApiError(result.error).message}. Check the scan host and retry.` })
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
      router.push(`/sites/${slug}/compare?current=${current.scanId}&base=${base.scanId}`)
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
