import type { ScanId } from '@unlighthouse/contracts'
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { compareRowKey } from '~/features/compare/presentation'

export type CompareStatusFilter = 'all' | 'changed' | 'regressed' | 'improved' | 'added' | 'removed'
export type CompareDeviceFilter = '' | 'mobile' | 'desktop'

export interface CwvP75Row {
  metric: string
  baseP75: number | null
  currentP75: number | null
  delta: number | null
  label: string
  verdict: string | null
}

export function thresholdPayload(thresholds: Record<string, string>): Record<string, number> | undefined {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(thresholds)) {
    const n = Number.parseFloat(v)
    if (!Number.isNaN(n) && v.trim() !== '')
      out[k] = n
  }
  return Object.keys(out).length ? out : undefined
}

export function useCompareWorkflow() {
  const route = useRoute()
  const router = useRouter()
  const api = useApi()

  // `currentScanId` comes from /compare/:id; `baseScanId` rides the
  // query string so a compare can be deep-linked and refresh-survives.
  const currentScanId = computed(() => route.params.id as string as ScanId)
  // `undefined` is the "nothing picked" sentinel; once chosen it's a real
  // ScanId, matching both the `value: s.scanId` items the USelect renders and
  // the v-model type the select infers from those items.
  const baseScanId = ref<ScanId | undefined>((route.query.base as string) ? (route.query.base as string as ScanId) : undefined)

  watch(baseScanId, (v) => {
    // Sync the picked base back into the URL — preserves on refresh,
    // makes the compare shareable as a single link.
    router.replace({ query: { ...route.query, base: v || undefined } })
  })

  const { data: currentMeta, error: currentMetaError, refresh: refreshCurrentMeta } = useApiQuery(
    'scan.meta',
    () => ({ scanId: currentScanId.value }),
  )

  const { data: baseMeta } = useApiQuery(
    'scan.meta',
    () => ({ scanId: baseScanId.value as ScanId }),
    { enabled: () => !!baseScanId.value },
  )

  // History is loaded with a generous page size so users with many scans can
  // still pick anything from the dropdown without paging. 200 is the server cap;
  // for orgs that exceed it we'd need a search box.
  const { data: history, error: historyError } = useApiQuery(
    'history.list',
    () => ({ page: 1, pageSize: 200 }),
  )

  // Only scans of the same site can produce meaningful route overlap.
  const otherScans = computed(() => {
    if (!history.value?.items || !currentMeta.value)
      return []
    const site = currentMeta.value.site
    return history.value.items.filter(s =>
      s.scanId !== currentScanId.value
      && s.status === 'complete'
      && s.site === site,
    )
  })

  // Auto-pick the most recent prior scan on the same site (+ branch if the
  // current scan has one). Doesn't override an explicit URL pick.
  // Gated on currentMeta loading + no explicit base pick; when currentMeta
  // arrives `enabled` flips and the query runs. `.catch(null)` keeps "no prior
  // scan" an expected empty result rather than a surfaced error.
  const { data: autoBase } = useNuxtAsyncQuery<ScanId | null>(
    () => api['compare.findPrevious']({
      site: currentMeta.value!.site,
      device: currentMeta.value!.device,
      branch: currentMeta.value!.ciBranch ?? undefined,
      excludeScanId: currentScanId.value,
    }).then(res => res.scanId ?? null).catch(() => null),
    {
      key: () => `compare-auto:${currentScanId.value}`,
      enabled: () => !!currentMeta.value && !baseScanId.value,
    },
  )

  watch(autoBase, (id) => {
    if (id && !baseScanId.value)
      baseScanId.value = id
  })

  const comparing = ref(false)
  const statusFilter = ref<CompareStatusFilter>('all')
  const deviceFilter = ref<CompareDeviceFilter>('')
  const urlFilter = ref('')
  const page = ref(1)
  const sortKey = ref('delta-perf-desc')
  const selectedRowKey = ref<string | null>(null)

  // Threshold UI bound to the same shape compare.detail accepts. Empty string
  // means omit, and the handler falls back to CI defaults.
  const thresholds = reactive<Record<string, string>>({
    'performance': '',
    'accessibility': '',
    'seo': '',
    'best-practices': '',
    'lcp': '',
    'cls': '',
    'inp': '',
  })

  const report = ref<any>(null)
  // Pack diffs come from compare.run (which is the threshold-based diff path);
  // compare.detail only carries route data. Keep it separate so filter/sort
  // changes do not refetch pack summaries.
  const packReport = ref<any>(null)
  const copyingMarkdown = ref(false)
  const showLegacyMetrics = ref(false)
  const showPackDetails = ref(false)

  const currentThresholdPayload = () => thresholdPayload(thresholds)

  async function copyAsMarkdown() {
    if (!baseScanId.value)
      return
    copyingMarkdown.value = true
    try {
      const res = await api['compare.markdown']({
        baseScanId: baseScanId.value,
        currentScanId: currentScanId.value,
        thresholds: currentThresholdPayload() as any,
      })
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(res.markdown)
      }
      else {
        const ta = document.createElement('textarea')
        ta.value = res.markdown
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.success(res.hasRegressions ? 'Copied — regressions present' : 'Copied to clipboard')
    }
    catch (err: any) {
      toast.error('Copy failed', { description: err.message })
    }
    finally {
      copyingMarkdown.value = false
    }
  }

  async function fetchPage() {
    const base = baseScanId.value
    if (!base)
      return
    try {
      // Typed command call (no `api as any`): only `thresholds` keeps a narrow
      // cast — the UI builds a plain `Record<string, number>`, looser than the
      // contract's `Partial<Record<ThresholdKey, number>>`.
      report.value = await api['compare.detail']({
        baseScanId: base,
        currentScanId: currentScanId.value,
        page: page.value,
        pageSize: 100,
        sort: sortKey.value,
        filter: {
          url: urlFilter.value || undefined,
          status: statusFilter.value,
          device: deviceFilter.value || undefined,
        },
        thresholds: currentThresholdPayload() as never,
      })
    }
    catch (err: any) {
      toast.error('Compare failed', { description: err.message })
    }
  }

  async function fetchPacks() {
    const base = baseScanId.value
    if (!base)
      return
    try {
      packReport.value = await api['compare.run']({
        baseScanId: base,
        currentScanId: currentScanId.value,
        thresholds: currentThresholdPayload() as never,
      })
    }
    catch {
      packReport.value = null
    }
  }

  const cwvPackDiff = computed(() => {
    if (!packReport.value?.packDiffs)
      return null
    return packReport.value.packDiffs.find((p: any) => p.packName === 'cwv') ?? null
  })

  const cwvP75Rows = computed<CwvP75Row[]>(() => {
    const diff = cwvPackDiff.value
    if (!diff)
      return []
    const baseMetrics: any[] = (diff.base as any)?.metrics ?? []
    const currentMetrics: any[] = (diff.current as any)?.metrics ?? []
    const byMetric = new Map<string, { base?: any, current?: any }>()
    for (const m of baseMetrics) byMetric.set(m.metric, { ...(byMetric.get(m.metric) || {}), base: m })
    for (const m of currentMetrics) byMetric.set(m.metric, { ...(byMetric.get(m.metric) || {}), current: m })
    const order = ['lcp', 'cls', 'inp']
    return order
      .filter(m => byMetric.has(m))
      .map((m) => {
        const { base, current } = byMetric.get(m)!
        const baseP75 = base?.p75 ?? null
        const currentP75 = current?.p75 ?? null
        const delta = baseP75 != null && currentP75 != null ? currentP75 - baseP75 : null
        return {
          metric: m,
          label: m.toUpperCase(),
          baseP75,
          currentP75,
          delta,
          verdict: current?.verdict ?? base?.verdict ?? null,
        }
      })
  })

  const otherPackChanges = computed(() => {
    if (!packReport.value?.packDiffs)
      return []
    return packReport.value.packDiffs.filter((p: any) => p.packName !== 'cwv' && p.hasChanges)
  })

  async function handleCompare() {
    if (!baseScanId.value)
      return
    comparing.value = true
    selectedRowKey.value = null
    page.value = 1
    try {
      await Promise.all([fetchPage(), fetchPacks()])
    }
    finally {
      comparing.value = false
    }
  }

  function swapDirection() {
    if (!baseScanId.value)
      return
    const oldBase = baseScanId.value
    router.push(`/compare/${oldBase}?base=${currentScanId.value}`)
  }

  let filterTimeout: ReturnType<typeof setTimeout> | null = null
  function onFilterInput(val: string) {
    if (filterTimeout)
      clearTimeout(filterTimeout)
    urlFilter.value = val
    filterTimeout = setTimeout(() => {
      page.value = 1
      void fetchPage()
    }, 300)
  }

  function resetPageAndFetch() {
    page.value = 1
    void fetchPage()
  }
  watch(statusFilter, resetPageAndFetch)
  watch(deviceFilter, resetPageAndFetch)
  watch(sortKey, resetPageAndFetch)
  watch(page, () => void fetchPage())

  const hasMultipleDevices = computed(() => {
    if (!report.value?.routes?.items)
      return false
    const devices = new Set(report.value.routes.items.map((r: any) => r.device))
    return devices.size > 1
  })

  const selectedRow = computed(() => {
    if (!selectedRowKey.value || !report.value)
      return null
    return report.value.routes.items.find((r: any) => compareRowKey(r) === selectedRowKey.value) ?? null
  })

  const totalPages = computed(() => {
    if (!report.value)
      return 1
    return Math.ceil(report.value.routes.total / report.value.routes.pageSize)
  })

  const verdict = computed(() => {
    if (!report.value)
      return null
    const s = report.value.summary
    if (s.regressedRoutes > 0)
      return { tone: 'destructive', text: `${s.regressedRoutes} route${s.regressedRoutes === 1 ? '' : 's'} regressed` }
    if (s.improvedRoutes > 0)
      return { tone: 'default', text: `${s.improvedRoutes} route${s.improvedRoutes === 1 ? '' : 's'} improved` }
    if (s.addedRoutes > 0 || s.removedRoutes > 0)
      return { tone: 'secondary', text: 'Route set changed' }
    return { tone: 'outline', text: 'No significant change' }
  })

  watch([baseScanId, currentScanId], ([b, c]) => {
    if (b && c) {
      page.value = 1
      void fetchPage()
      void fetchPacks()
    }
  }, { immediate: true })

  onUnmounted(() => {
    if (filterTimeout)
      clearTimeout(filterTimeout)
  })

  function shortId(id: string | null | undefined): string {
    if (!id)
      return ''
    return id.slice(0, 8)
  }

  function gotoOverview(id: string | undefined) {
    if (!id)
      return
    router.push(`/scan/${id}/routes`)
  }

  return {
    currentScanId,
    baseScanId,
    currentMeta,
    currentMetaError,
    historyError,
    refreshCurrentMeta,
    baseMeta,
    otherScans,
    comparing,
    statusFilter,
    deviceFilter,
    urlFilter,
    page,
    sortKey,
    selectedRowKey,
    thresholds,
    report,
    copyingMarkdown,
    showLegacyMetrics,
    showPackDetails,
    copyAsMarkdown,
    cwvP75Rows,
    otherPackChanges,
    handleCompare,
    swapDirection,
    onFilterInput,
    hasMultipleDevices,
    selectedRow,
    totalPages,
    verdict,
    shortId,
    gotoOverview,
  }
}
