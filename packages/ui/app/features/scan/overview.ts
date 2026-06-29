import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useScanWebsocket } from '~/features/scan/live-events'
import { useScanBase } from '~/features/scan/route-context'
import { useScanStore } from '~/stores/scan'

type DeviceFilter = '' | 'mobile' | 'desktop'

const CATEGORY_DEFS = [
  { key: 'performance', label: 'Performance', icon: 'lucide:gauge', path: 'performance' },
  { key: 'seo', label: 'SEO', icon: 'lucide:search', path: 'seo' },
  { key: 'accessibility', label: 'Accessibility', icon: 'lucide:accessibility', path: 'accessibility' },
  { key: 'best-practices', label: 'Best Practices', icon: 'lucide:shield-check', path: 'best-practices' },
  { key: 'agentic-browsing', label: 'Agentic', icon: 'lucide:bot', path: 'agentic-browsing' },
] as const

function scoreColorFromRing(scoreToRingColor: (score: number | null) => string, score: number | null): string {
  if (score == null)
    return 'var(--muted-foreground)'
  return scoreToRingColor(score)
}

export function useScanOverview() {
  const route = useRoute()
  const router = useRouter()
  const api = useApi()
  const store = useScanStore()
  const { scanId, scanBase } = useScanBase()
  const exportBaseUrl = useRuntimeConfig().public.unlighthouseApiUrl as string
  const { scoreToColor, scoreToLabel, scoreToRingColor } = useScoreColor()

  const { data: scanMeta } = useAsyncData(
    `scan-meta-${scanId.value}`,
    () => api['scan.meta']({ scanId: scanId.value }).catch(() => null),
    { watch: [scanId] },
  )

  const isCurrentScan = computed(() => store.scanId === scanId.value)
  const currentScanIsActive = computed(() => isCurrentScan.value && store.isActive)
  const showLiveView = computed(() => currentScanIsActive.value || (isCurrentScan.value && store.status === 'paused'))
  const showScanActions = computed(() => currentScanIsActive.value || store.status === 'paused')

  watch(
    () => store.status,
    (status, prev) => {
      const becameComplete = status === 'complete' && prev && prev !== 'complete'
      if (becameComplete && isCurrentScan.value)
        router.replace(`${scanBase.value}/routes`)
    },
  )

  const wsEnabled = Boolean(useRuntimeConfig().public.unlighthouseWsUrl)

  async function startPollingIfActive() {
    if (wsEnabled)
      return
    const status = await api['scan.status']({ scanId: scanId.value }).catch(() => null)
    if (status && ['starting', 'discovering', 'scanning', 'paused'].includes(status.status)) {
      store.hydrateActive(scanId.value, { ...status, site: scanMeta.value?.site })
      store.startPolling(api)
    }
  }

  onMounted(startPollingIfActive)
  watch(scanId, () => {
    store.stopPolling()
    startPollingIfActive()
  })
  onBeforeUnmount(() => store.stopPolling())

  const resolvedStatus = computed(() => {
    if (scanMeta.value?.summary)
      return 'complete'
    if (isCurrentScan.value)
      return store.status
    return 'complete'
  })

  const scanIsComplete = computed(() => resolvedStatus.value === 'complete')
  const deviceFilter = ref<DeviceFilter>('')

  const { data: deviceProbe } = useAsyncData(
    `scan-devices-${scanId.value}`,
    async () => {
      if (!scanIsComplete.value)
        return null
      const [mobile, desktop] = await Promise.all([
        api['scan.results']({ scanId: scanId.value, device: 'mobile', page: 1, pageSize: 1 }).catch(() => ({ total: 0 } as any)),
        api['scan.results']({ scanId: scanId.value, device: 'desktop', page: 1, pageSize: 1 }).catch(() => ({ total: 0 } as any)),
      ])
      return { mobile: (mobile.total ?? 0) > 0, desktop: (desktop.total ?? 0) > 0 }
    },
    { watch: [scanId, scanIsComplete] },
  )

  const hasMultipleDevices = computed(() => Boolean(deviceProbe.value?.mobile && deviceProbe.value?.desktop))

  const { data: scanSummary, refresh: refreshSummary } = useAsyncData(
    `scan-summary-${scanId.value}`,
    () => {
      if (!scanIsComplete.value)
        return Promise.resolve(null)
      return api['scan.summary']({
        scanId: scanId.value,
        device: deviceFilter.value || undefined,
      }).catch(() => null)
    },
    { watch: [scanId, scanIsComplete, deviceFilter] },
  )

  useScanWebsocket({ 'scan:complete': refreshSummary })

  const rescanningAll = ref(false)
  async function handleRescanAll() {
    rescanningAll.value = true
    try {
      const result = await api['scan.rescanAll']({ scanId: scanId.value })
      toast.success('Rescan started')
      router.push(`/sites/${route.params.siteId}/scans/${result.scanId}/overview`)
    }
    catch (err: any) {
      toast.error('Rescan failed', { description: err.message })
    }
    finally {
      rescanningAll.value = false
    }
  }

  const categories = computed(() => {
    const averages = (scanSummary.value?.categoryAverages ?? {}) as Record<string, number | null>
    return CATEGORY_DEFS.map(category => ({
      ...category,
      score: averages[category.key] ?? null,
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
        { label: 'Pass', count: distribution.passing, pct: (distribution.passing / total) * 100, color: '#22c55e' },
        { label: 'Needs Work', count: distribution.needsWork, pct: (distribution.needsWork / total) * 100, color: '#f97316' },
        { label: 'Poor', count: distribution.poor, pct: (distribution.poor / total) * 100, color: '#ef4444' },
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

  const siteTitle = computed(() => scanMeta.value?.site || store.site || 'Scan')
  const jsonExportUrl = computed(() => `${exportBaseUrl}/dashboard/export/${scanId.value}`)
  const csvExportUrl = computed(() => `${exportBaseUrl}/dashboard/export/${scanId.value}?format=csv`)
  const jsonExportName = computed(() => `${scanId.value}-export.json`)
  const csvExportName = computed(() => `${scanId.value}-export.csv`)

  return {
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
    rescanningAll,
    categories,
    distribution,
    donutArcs,
    scoreToColor,
    scoreToLabel,
    scoreColor,
    jsonExportUrl,
    csvExportUrl,
    jsonExportName,
    csvExportName,
    handleRescanAll,
  }
}
