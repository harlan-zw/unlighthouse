import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useScanBase } from '~/features/scan/route-context'
import { useScanStore } from '~/stores/scan'

type DeviceFilter = '' | 'mobile' | 'desktop'
type CategoryScoreDisplayMode = 'gauge' | 'fraction'

// D-045: category score cards link to the pack tab that projects that
// category, not a bespoke category page (deleted). These five stay a
// hand-maintained list — unlike the sidebar's pack tabs, they're score
// AGGREGATES (per CONTEXT.md), not a 1:1 mirror of pack.list, so there's no
// generated source to collapse onto here.
const CATEGORY_DEFS = [
  { key: 'performance', label: 'Performance', icon: 'gauge', path: 'packs/cwv' },
  { key: 'seo', label: 'SEO', icon: 'search', path: 'packs/seo-basics' },
  { key: 'accessibility', label: 'Accessibility', icon: 'accessibility', path: 'packs/a11y-quick-wins' },
  { key: 'best-practices', label: 'Best Practices', icon: 'shield-check', path: 'packs/best-practices' },
  { key: 'agentic-browsing', label: 'Agentic', icon: 'bot', path: 'packs/agentic-browsing' },
] as const

function scoreColorFromRing(scoreToRingColor: (score: number | null) => string, score: number | null): string {
  if (score == null)
    return 'var(--ui-text-muted)'
  return scoreToRingColor(score)
}

async function optionalApiRead<T>(command: string, promise: Promise<T>): Promise<T | null> {
  return promise.catch((err) => {
    logOperationalWarn('ui.optional_api_read_failed', err, { command, feature: 'scan-overview' }, console)
    return null
  })
}

export function useScanOverview() {
  const route = useRoute()
  const router = useRouter()
  const api = useApi()
  const store = useScanStore()
  const { scanId, scanBase } = useScanBase()
  const exportBaseUrl = useRuntimeConfig().public.unlighthouseApiUrl as string
  const { scoreToColor, scoreToLabel, scoreToRingColor } = createScoreColorHelpers()

  const { data: scanMeta, error: scanMetaError, refresh: refreshScanMeta } = useApiQuery(
    'scan.meta',
    () => ({ scanId: scanId.value }),
  )

  const isCurrentScan = computed(() => store.scanId === scanId.value)
  const currentScanIsActive = computed(() => isCurrentScan.value && store.isActive)
  const showLiveView = computed(() => currentScanIsActive.value || (isCurrentScan.value && store.status === 'paused'))
  const showScanActions = computed(() => currentScanIsActive.value || store.status === 'paused')

  // D-049: Overview is the single landing tab — a live scan transitions to the
  // completed view in place instead of being redirected to `/routes`.
  // `resolvedStatus`/`scanIsComplete` below flip off `store.status` (set by the
  // `scan:complete` WS event, or the polling fallback), which flips
  // `scanSummary`'s `enabled` from false to true; nuxt-use-query's lifecycle
  // refetches on that transition on its own (no manual refresh needed here).
  // `useScanSubscription` (mounted in `layouts/scan.vue`) also invalidates
  // `scan.summary`/`scan.results`/`scan.meta` on the same event, covering
  // scan-detail views mounted elsewhere (e.g. the routes table).
  const wsEnabled = Boolean(useRuntimeConfig().public.unlighthouseWsUrl)

  async function startPollingIfActive() {
    if (wsEnabled)
      return
    const status = await optionalApiRead('scan.status', api['scan.status']({ scanId: scanId.value }))
    if (status && ['starting', 'discovering', 'scanning', 'paused'].includes(status.status)) {
      store.hydrateActive(scanId.value, { ...status, site: scanMeta.value?.site })
      store.startPolling()
    }
  }

  onMounted(startPollingIfActive)
  watch(scanId, () => {
    store.stopPolling()
    startPollingIfActive()
  })
  onBeforeUnmount(() => store.stopPolling())

  // A scan the store doesn't own (shared link, second tab, hard refresh) with
  // no `summary` yet isn't necessarily finished — `summary` only appears on
  // completion, so absence just means "unknown". Probe the cheap `scan.status`
  // lookup instead of assuming complete; on WS deployments nothing else would
  // ever check this (the WS subscription only starts once the store already
  // owns the scan), so without this the page would render 'complete' until an
  // eventual `scan:complete` event happened to arrive.
  const needsStatusProbe = computed(() => !isCurrentScan.value && !!scanMeta.value && !scanMeta.value.summary)
  const { data: remoteStatus } = useApiQuery(
    'scan.status',
    () => ({ scanId: scanId.value }),
    { enabled: needsStatusProbe },
  )

  // If the probe finds the scan genuinely active, hand ownership to the store
  // so the live view + WS/poll subscription engage in place, same as a scan
  // started from this tab.
  watch(remoteStatus, (status) => {
    if (status && ['starting', 'discovering', 'scanning', 'paused'].includes(status.status))
      store.hydrateActive(scanId.value, { ...status, site: scanMeta.value?.site })
  })

  const resolvedStatus = computed(() => {
    if (scanMeta.value?.summary)
      return 'complete'
    if (isCurrentScan.value)
      return store.status
    return remoteStatus.value?.status ?? 'pending'
  })

  const scanIsComplete = computed(() => resolvedStatus.value === 'complete')
  const deviceFilter = ref<DeviceFilter>('')

  // Composite probe (two reads), so it uses the handler-based query directly.
  // The per-device `.catch` is a deliberate "treat an errored probe as absent"
  // fallback, not error-swallowing — a missing device just hides the toggle.
  const { data: deviceProbe } = useNuxtAsyncQuery<{ mobile: boolean, desktop: boolean }>(
    async () => {
      const [mobile, desktop] = await Promise.all([
        optionalApiRead('scan.results', api['scan.results']({ scanId: scanId.value, device: 'mobile', page: 1, pageSize: 1 })),
        optionalApiRead('scan.results', api['scan.results']({ scanId: scanId.value, device: 'desktop', page: 1, pageSize: 1 })),
      ])
      return { mobile: (mobile?.total ?? 0) > 0, desktop: (desktop?.total ?? 0) > 0 }
    },
    {
      key: () => `scan-devices:${scanId.value}`,
      enabled: scanIsComplete,
    },
  )

  const hasMultipleDevices = computed(() => Boolean(deviceProbe.value?.mobile && deviceProbe.value?.desktop))

  const { data: scanSummary, error: scanSummaryError, refresh: refreshSummary } = useApiQuery(
    'scan.summary',
    () => ({ scanId: scanId.value, device: deviceFilter.value || undefined }),
    { enabled: scanIsComplete },
  )

  const rescan = useApiMutation('scan.rescanAll')
  const rescanningAll = rescan.isPending
  async function handleRescanAll() {
    const result = await rescan.mutateSafe({ scanId: scanId.value })
    if (result._tag === 'err') {
      toast.error('Rescan all failed', { description: `${normalizeApiError(result.error).message}. Check the scan host and retry.` })
      return
    }
    toast.success('Rescan started')
    router.push(`/sites/${route.params.siteId}/scans/${result.data.scanId}/overview`)
  }

  const categories = computed(() => {
    const averages = (scanSummary.value?.categoryAverages ?? {}) as Record<string, number | null>
    const displayModes = (scanSummary.value?.categoryScoreDisplayModes ?? {}) as Record<string, CategoryScoreDisplayMode | undefined>
    const fractions = (scanSummary.value?.categoryFractions ?? {}) as Record<string, { passing: number, total: number } | undefined>
    return CATEGORY_DEFS.map(category => ({
      ...category,
      score: averages[category.key] ?? null,
      categoryScoreDisplayMode: displayModes[category.key] ?? (category.key === 'agentic-browsing' ? 'fraction' : 'gauge'),
      fraction: fractions[category.key] ?? null,
    }))
  })

  const distribution = computed(() => {
    if (!scanSummary.value)
      return null
    const distribution = scanSummary.value.distribution
    const total = scanSummary.value.routesScanned || 1
    return {
      total,
      segments: [
        { label: 'Pass', count: distribution.passing, pct: (distribution.passing / total) * 100, color: BAND_HEX.good, status: 'success' as const },
        { label: 'Needs Work', count: distribution.needsWork, pct: (distribution.needsWork / total) * 100, color: BAND_HEX.average, status: 'warning' as const },
        { label: 'Poor', count: distribution.poor, pct: (distribution.poor / total) * 100, color: BAND_HEX.poor, status: 'error' as const },
      ].filter(segment => segment.count > 0),
    }
  })

  const donutArcs = computed(() => {
    if (!distribution.value)
      return []
    const segments = distribution.value.segments
    const total = segments.reduce((sum, segment) => sum + segment.count, 0) || 1
    const gap = 0.02
    const totalGap = gap * segments.length
    const available = 1 - totalGap
    let offset = -0.25
    return segments.map((segment) => {
      const ratio = (segment.count / total) * available
      const circumference = 2 * Math.PI * 40
      const dashLen = ratio * circumference
      const gapLen = circumference - dashLen
      const rotation = offset * 360
      offset += ratio + gap
      return { ...segment, dashLen, gapLen, rotation }
    })
  })

  function scoreColor(score: number | null): string {
    return scoreColorFromRing(scoreToRingColor, score)
  }

  function categoryScoreLabel(category: { score: number | null, categoryScoreDisplayMode: CategoryScoreDisplayMode, fraction: { passing: number, total: number } | null }): string | number {
    if (category.categoryScoreDisplayMode === 'fraction' && category.fraction && category.fraction.total > 0)
      return `${category.fraction.passing}/${category.fraction.total}`
    return scoreToLabel(category.score)
  }

  const siteTitle = computed(() => scanMeta.value?.site || store.site || 'Scan')
  const jsonExportUrl = computed(() => `${exportBaseUrl}/dashboard/export/${scanId.value}`)
  const csvExportUrl = computed(() => `${exportBaseUrl}/dashboard/export/${scanId.value}?format=csv`)
  const jsonExportName = computed(() => `${scanId.value}-export.json`)
  const csvExportName = computed(() => `${scanId.value}-export.csv`)

  return {
    scanId,
    scanBase,
    scanMeta,
    siteTitle,
    currentScanIsActive,
    showScanActions,
    showLiveView,
    resolvedStatus,
    scanIsComplete,
    deviceFilter,
    hasMultipleDevices,
    scanSummary,
    scanMetaError,
    scanSummaryError,
    refreshScanMeta,
    refreshSummary,
    rescanningAll,
    categories,
    distribution,
    donutArcs,
    scoreToColor,
    scoreToLabel,
    scoreColor,
    categoryScoreLabel,
    jsonExportUrl,
    csvExportUrl,
    jsonExportName,
    csvExportName,
    handleRescanAll,
  }
}
