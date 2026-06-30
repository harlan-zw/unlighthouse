import type { ScanRow } from '~/features/sites/scan-pairs'
import { computed } from 'vue'
import { scanLinkPath } from '~/features/scan/scan-links'
import { useScanStore } from '~/stores/scan'
import { siteSlug } from '~/utils/site'

export interface DashboardSiteRow {
  name: string
  slug: string
  url: string
  avg: number | null
  cats: Record<string, number | undefined>
  series: number[]
  lastAt: string | null
  scanCount: number
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  }
  catch (_err) {
    // Dashboard rows can contain legacy non-URL site labels.
    return url
  }
}

function completedScans(scans: ScanRow[]): ScanRow[] {
  return scans.filter(scan => scan.summary && (scan.summary.completed ?? 0) > 0)
}

export function useDashboardOverview() {
  const router = useRouter()
  const store = useScanStore()

  const { data: histResp, status: historyStatus, error: historyError, refresh: refreshHistory } = useApiQuery(
    'history.list',
    () => ({ page: 1, pageSize: 200 }),
  )
  const { data: sitesData, error: sitesError, refresh: refreshSites } = useApiQuery('sites.list', () => ({}))

  const allScans = computed(() => (histResp.value?.items ?? []) as ScanRow[])
  const totalScans = computed(() => histResp.value?.total ?? 0)

  const byOrigin = computed(() => {
    const grouped = new Map<string, ScanRow[]>()
    for (const scan of allScans.value) {
      const origin = originOf(scan.site)
      const scans = grouped.get(origin) ?? []
      scans.push(scan)
      grouped.set(origin, scans)
    }
    for (const scans of grouped.values())
      scans.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    return grouped
  })

  const siteRows = computed<DashboardSiteRow[]>(() =>
    (sitesData.value?.sites ?? []).map((site) => {
      const scans = completedScans(byOrigin.value.get(originOf(site.url)) ?? [])
      const latest = scans[0] ?? null
      const series = [...scans].reverse().slice(-12).map(scan => Math.round((scan.summary?.scoreAverage ?? 0) * 100))
      return {
        name: site.name || siteSlug(site.url),
        slug: siteSlug(site.url),
        url: site.url,
        avg: latest?.summary?.scoreAverage ?? null,
        cats: (latest?.summary?.scoresByCategory ?? {}) as Record<string, number | undefined>,
        series,
        lastAt: latest?.startedAt ?? null,
        scanCount: scans.length,
      }
    }),
  )

  const kpis = computed(() => {
    const averages = siteRows.value.map(row => row.avg).filter((value): value is number => value != null)
    return {
      sites: siteRows.value.length,
      scans: totalScans.value,
      avg: averages.length ? Math.round((averages.reduce((total, value) => total + value, 0) / averages.length) * 100) : null,
      needs: siteRows.value.filter((row) => {
        const band = scoreBand(row.avg)
        return band != null && band !== 'good'
      }).length,
    }
  })

  const recentScans = computed(() => allScans.value.slice(0, 10))
  const isEmpty = computed(() => historyStatus.value !== 'pending' && !allScans.value.length && !store.isActive)

  const activeScan = computed(() => ({
    isActive: store.isActive,
    site: store.site,
    scanId: store.scanId,
    scanned: store.scanned,
    total: store.total,
    percent: store.percent,
  }))

  function openActiveScan() {
    if (!store.scanId)
      return
    router.push(`/sites/${siteSlug(store.site || '')}/scans/${store.scanId}/overview`)
  }

  function openSite(row: DashboardSiteRow) {
    router.push(`/sites/${row.slug}`)
  }

  function openScan(scan: ScanRow) {
    router.push(scanLinkPath(siteSlug(scan.site), scan.scanId, scan.status))
  }

  return {
    historyStatus,
    historyError,
    sitesError,
    refreshHistory,
    refreshSites,
    allScans,
    siteRows,
    kpis,
    recentScans,
    isEmpty,
    activeScan,
    openActiveScan,
    openSite,
    openScan,
  }
}
