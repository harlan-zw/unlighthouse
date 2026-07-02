import type { Site } from '~/features/sites/registry'
import type { ScanRow } from '~/features/sites/scan-pairs'
import { computed } from 'vue'
import { useScanStore } from '~/stores/scan'
import { siteSlug } from '~/utils/site'

// Sites home (D-047): `/` is the only site list, the registered registry
// (`sites.list`) merged with every origin `history.list` has scanned that
// isn't in the registry. Orphan scans stay reachable (deleted sites keep
// their history via `onDelete: 'set null'`; `scan.import` can reference an
// unknown site) without a second page.

export interface SiteHomeRow {
  /** Registry id for registered rows, the scan origin otherwise. */
  key: string
  registered: boolean
  /** Raw registry record, present only for registered rows (drives edit/delete). */
  site: Site | null
  name: string
  slug: string
  url: string
  group: string | null
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
    // Rows can carry legacy non-URL site labels.
    return url
  }
}

function completedScans(scans: ScanRow[]): ScanRow[] {
  return scans.filter(scan => scan.summary && (scan.summary.completed ?? 0) > 0)
}

function buildRow(input: { registered: boolean, site: Site | null, name: string, url: string, group: string | null }, scans: ScanRow[]): SiteHomeRow {
  const completed = completedScans(scans)
  const latest = completed[0] ?? null
  const series = [...completed].reverse().slice(-12).map(scan => Math.round((scan.summary?.scoreAverage ?? 0) * 100))
  return {
    key: input.site?.id ?? originOf(input.url),
    registered: input.registered,
    site: input.site,
    name: input.name,
    slug: siteSlug(input.url),
    url: input.url,
    group: input.group,
    avg: latest?.summary?.scoreAverage ?? null,
    cats: (latest?.summary?.scoresByCategory ?? {}) as Record<string, number | undefined>,
    series,
    lastAt: latest?.startedAt ?? null,
    scanCount: completed.length,
  }
}

export function useSitesHome() {
  const router = useRouter()
  const store = useScanStore()

  const { data: histResp, status: historyStatus, error: historyError, refresh: refreshHistory } = useApiQuery(
    'history.list',
    () => ({ page: 1, pageSize: 200 }),
  )
  const { data: sitesData, error: sitesError, refresh: refreshSites } = useApiQuery('sites.list', () => ({}))

  const allScans = computed(() => (histResp.value?.items ?? []) as ScanRow[])

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

  const registeredSites = computed(() => (sitesData.value?.sites ?? []) as Site[])
  const registeredOrigins = computed(() => new Set(registeredSites.value.map(site => originOf(site.url))))

  const rows = computed<SiteHomeRow[]>(() => {
    const registered = registeredSites.value.map(site =>
      buildRow(
        { registered: true, site, name: site.name || siteSlug(site.url), url: site.url, group: site.group },
        byOrigin.value.get(originOf(site.url)) ?? [],
      ),
    )

    const unregistered = [...byOrigin.value.keys()]
      .filter(origin => !registeredOrigins.value.has(origin))
      .map(origin => buildRow(
        { registered: false, site: null, name: siteSlug(origin), url: origin, group: null },
        byOrigin.value.get(origin) ?? [],
      ))
      // Most-recently-scanned orphan origin first. The registry itself
      // (curated, so it keeps its own order) always leads the list.
      .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))

    return [...registered, ...unregistered]
  })

  const isEmpty = computed(() => historyStatus.value !== 'pending' && !rows.value.length && !store.isActive)

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

  function openSite(row: SiteHomeRow) {
    router.push(`/sites/${row.slug}`)
  }

  return {
    historyStatus,
    historyError,
    sitesError,
    refreshHistory,
    refreshSites,
    rows,
    isEmpty,
    activeScan,
    openActiveScan,
    openSite,
  }
}
