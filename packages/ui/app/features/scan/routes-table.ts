import type { ScanId } from '@unlighthouse/contracts'
import type { SortingState } from '@tanstack/vue-table'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useScanWebsocket } from '~/features/scan/live-events'
import { useScanBase } from '~/features/scan/route-context'
import { useScanStore } from '~/stores/scan'

type RouteDeviceFilter = 'all' | 'mobile' | 'desktop'
type RouteQuickFilter = 'all' | 'failing' | 'poor-cwv'
type RouteDensity = 'comfortable' | 'compact'

export interface RouteRow {
  url: string
  path: string
  device: string
  scorePerformance: number | null
  scoreAccessibility: number | null
  scoreSeo: number | null
  scoreBestPractices: number | null
  lcp: number | null
  cls: number | null
  tbt: number | null
  fcp: number | null
  si: number | null
  ttfb: number | null
}

interface RouteSummary {
  count: number
  avg: number | null
  pass: number
  needs: number
  poor: number
  devices: string[]
}

interface ColumnVisibilityToggle {
  id: string
  getIsVisible: () => boolean
  toggleVisibility: () => void
}

interface RoutesTableExpose {
  table: {
    getAllLeafColumns: () => ColumnVisibilityToggle[]
  }
}

const ROUTES_PAGE_SIZE = 500

export const QUICK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'failing', label: 'Failing' },
  { key: 'poor-cwv', label: 'Poor CWV' },
] as const

const CWV_THRESHOLDS: Record<'lcp' | 'cls' | 'tbt', [number, number]> = {
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  tbt: [200, 600],
}

export const SCORE_COLS: { key: keyof Pick<RouteRow, 'scorePerformance' | 'scoreAccessibility' | 'scoreSeo' | 'scoreBestPractices'>, label: string }[] = [
  { key: 'scorePerformance', label: 'Perf' },
  { key: 'scoreAccessibility', label: 'A11y' },
  { key: 'scoreSeo', label: 'SEO' },
  { key: 'scoreBestPractices', label: 'BP' },
]

export const CWV_COLS: { key: keyof Pick<RouteRow, 'lcp' | 'cls' | 'tbt'>, label: string, unit: 'ms' | '' }[] = [
  { key: 'lcp', label: 'LCP', unit: 'ms' },
  { key: 'cls', label: 'CLS', unit: '' },
  { key: 'tbt', label: 'TBT', unit: 'ms' },
]

const COLUMN_LABELS: Record<string, string> = {
  thumbnail: 'Thumbnail',
  path: 'Path',
  device: 'Device',
  scorePerformance: 'Performance',
  scoreAccessibility: 'Accessibility',
  scoreSeo: 'SEO',
  scoreBestPractices: 'Best Practices',
  delta: 'Delta vs prev',
  lcp: 'LCP',
  cls: 'CLS',
  tbt: 'TBT',
}

function queryString(value: unknown): string {
  if (Array.isArray(value))
    return queryString(value[0])
  return typeof value === 'string' ? value : ''
}

function isRouteDeviceFilter(value: string): value is RouteDeviceFilter {
  return value === 'all' || value === 'mobile' || value === 'desktop'
}

function isRouteQuickFilter(value: string): value is RouteQuickFilter {
  return value === 'all' || value === 'failing' || value === 'poor-cwv'
}

export function overallRouteScore(row: Pick<RouteRow, 'scorePerformance' | 'scoreAccessibility' | 'scoreSeo' | 'scoreBestPractices'>): number | null {
  const scores = [row.scorePerformance, row.scoreAccessibility, row.scoreSeo, row.scoreBestPractices].filter((score): score is number => score != null)
  if (!scores.length)
    return null
  return Math.round((scores.reduce((total, score) => total + score, 0) / scores.length) * 100)
}

export function cwvColor(metric: keyof typeof CWV_THRESHOLDS, value: number | null): string {
  if (value == null)
    return 'text-muted'
  const [good, poor] = CWV_THRESHOLDS[metric]
  return value <= good ? 'text-success' : value <= poor ? 'text-warning' : 'text-error'
}

function routeScore100Color(value: number | null): string {
  if (value == null)
    return 'var(--muted-foreground)'
  return value >= 90 ? '#22c55e' : value >= 50 ? '#f97316' : '#ef4444'
}

export function formatRouteMetric(value: number | null, unit: 'ms' | '' = 'ms'): string {
  if (value === null)
    return '—'
  if (unit === 'ms')
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
  return value.toFixed(3)
}

function parseRouteSort(value?: string | null): SortingState {
  if (!value)
    return [{ id: 'scorePerformance', desc: false }]
  const [id, dir] = value.split(':')
  return id ? [{ id, desc: dir === 'desc' }] : [{ id: 'scorePerformance', desc: false }]
}

function passesQuickFilter(row: RouteRow, quick: RouteQuickFilter): boolean {
  if (quick === 'failing')
    return [row.scorePerformance, row.scoreAccessibility, row.scoreSeo, row.scoreBestPractices].some(score => score != null && score < 0.9)
  if (quick === 'poor-cwv')
    return (row.lcp != null && row.lcp > 4000) || (row.cls != null && row.cls > 0.25) || (row.tbt != null && row.tbt > 600)
  return true
}

function filterRouteRows(rows: RouteRow[], filters: { q: string, device: RouteDeviceFilter, quick: RouteQuickFilter }): RouteRow[] {
  const needle = filters.q.trim().toLowerCase()
  return rows.filter((row) => {
    if (filters.device !== 'all' && row.device !== filters.device)
      return false
    if (needle && !(row.path || row.url).toLowerCase().includes(needle))
      return false
    return passesQuickFilter(row, filters.quick)
  })
}

function summarizeRoutes(rows: RouteRow[]): RouteSummary {
  const overalls = rows.map(overallRouteScore).filter((score): score is number => score != null)
  const avg = overalls.length ? Math.round(overalls.reduce((total, score) => total + score, 0) / overalls.length) : null
  let pass = 0
  let needs = 0
  let poor = 0
  for (const score of overalls) {
    if (score >= 90)
      pass++
    else if (score >= 50)
      needs++
    else
      poor++
  }
  return {
    count: rows.length,
    avg,
    pass,
    needs,
    poor,
    devices: [...new Set(rows.map(row => row.device))],
  }
}

function routeFilterQuery(filters: { q: string, device: RouteDeviceFilter, quick: RouteQuickFilter, sorting: SortingState }): Record<string, string> {
  const query: Record<string, string> = {}
  if (filters.q.trim())
    query.q = filters.q.trim()
  if (filters.device !== 'all')
    query.device = filters.device
  if (filters.quick !== 'all')
    query.f = filters.quick
  const sort = filters.sorting[0]
  if (sort)
    query.sort = `${sort.id}:${sort.desc ? 'desc' : 'asc'}`
  return query
}

export function useScanRoutesTable() {
  const router = useRouter()
  const route = useRoute()
  const api = useApi()
  const store = useScanStore()
  const { scanId, scanBase } = useScanBase()

  const { data: scanResults, refresh } = useAsyncData(
    `scan-routes-table-${scanId.value}`,
    () => api['scan.results']({ scanId: scanId.value, page: 1, pageSize: ROUTES_PAGE_SIZE }).catch(() => null),
    { watch: [scanId] },
  )
  useScanWebsocket({ 'scan:complete': refresh })

  const { data: prevData } = useAsyncData(
    `routes-prev-${scanId.value}`,
    async () => {
      const meta = await api['scan.meta']({ scanId: scanId.value }).catch(() => null)
      if (!meta)
        return null
      const prev = await api['compare.findPrevious']({ site: meta.site, device: meta.device as any, excludeScanId: scanId.value }).catch(() => null)
      if (!prev?.scanId)
        return null
      const res = await api['scan.results']({ scanId: prev.scanId as ScanId, page: 1, pageSize: ROUTES_PAGE_SIZE }).catch(() => null)
      if (!res)
        return null
      const map = new Map<string, number>()
      for (const row of res.items as RouteRow[]) {
        const score = overallRouteScore(row)
        if (score != null)
          map.set(row.path || row.url, score)
      }
      return map
    },
    { watch: [scanId] },
  )

  const allRows = computed(() => (scanResults.value?.items ?? []) as RouteRow[])
  const total = computed(() => scanResults.value?.total ?? 0)
  const truncated = computed(() => total.value > allRows.value.length)
  const prevMap = computed(() => prevData.value ?? null)
  const hasPrev = computed(() => (prevMap.value?.size ?? 0) > 0)
  const hasMultipleDevices = computed(() => new Set(allRows.value.map(row => row.device)).size > 1)

  const q = ref(queryString(route.query.q))
  const rawDevice = queryString(route.query.device)
  const deviceFilter = ref<RouteDeviceFilter>(isRouteDeviceFilter(rawDevice) ? rawDevice : 'all')
  const rawQuick = queryString(route.query.f)
  const quick = ref<RouteQuickFilter>(isRouteQuickFilter(rawQuick) ? rawQuick : 'all')

  const filtered = computed(() => filterRouteRows(allRows.value, {
    q: q.value,
    device: deviceFilter.value,
    quick: quick.value,
  }))

  const showAllMetrics = ref(false)
  const summary = computed(() => summarizeRoutes(filtered.value))
  const sorting = ref<SortingState>(parseRouteSort(queryString(route.query.sort)))

  watch([q, deviceFilter, quick, sorting], () => {
    router.replace({
      query: routeFilterQuery({
        q: q.value,
        device: deviceFilter.value,
        quick: quick.value,
        sorting: sorting.value,
      }),
    })
  }, { deep: true })

  async function copyRouteUrl(row: RouteRow) {
    try {
      await navigator.clipboard.writeText(row.url)
      toast.success('URL copied')
    }
    catch {
      toast.error('Could not copy URL')
    }
  }

  async function rescanRoute(row: RouteRow) {
    try {
      await api['route.rescan']({ scanId: scanId.value, url: row.url })
      toast.success('Route rescan started', { description: row.path || row.url })
    }
    catch (err: any) {
      toast.error('Rescan failed', { description: err?.message })
    }
  }

  function openRoute(row: RouteRow) {
    router.push(`${scanBase.value}/route/${encodeURIComponent(row.path || row.url)}`)
  }

  const density = ref<RouteDensity>('comfortable')
  const tableRef = ref<RoutesTableExpose | null>(null)
  const columnToggleItems = computed(() => [
    [{ label: 'Toggle columns', type: 'label' as const }],
    (tableRef.value?.table?.getAllLeafColumns() ?? []).map(col => ({
      label: COLUMN_LABELS[col.id] ?? col.id,
      type: 'checkbox' as const,
      checked: col.getIsVisible(),
      onUpdateChecked: () => col.toggleVisibility(),
      onSelect: (event: Event) => event.preventDefault(),
    })),
  ])

  return {
    store,
    scanId,
    allRows,
    total,
    truncated,
    prevMap,
    hasPrev,
    hasMultipleDevices,
    q,
    deviceFilter,
    quick,
    filtered,
    showAllMetrics,
    summary,
    score100Color: routeScore100Color,
    sorting,
    density,
    tableRef,
    columnToggleItems,
    copyRouteUrl,
    rescanRoute,
    openRoute,
  }
}
