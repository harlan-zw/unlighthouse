import type { CompareReport, CompareRouteRow, ScanId } from '@unlighthouse/contracts'
import type { UnlighthouseClient } from '@unlighthouse/contracts/client'
import type { ApiError } from '~/composables/useApiError'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { useClipboard, watchDebounced } from '@vueuse/core'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { normalizeApiError } from '~/composables/useApiError'
import { compareRowKey } from '~/features/compare/presentation'
import { comparePairCompatibility, didComparePairChange, parseCompareQueryState } from '~/features/compare/state'
import { optionalScanId, routeParamString } from '~/features/scan/route-context'
import { hasMultipleDevicesForScans } from '~/features/sites/scan-pairs'
import { originOf } from '~/features/sites/site-url'
import { siteSlug } from '~/utils/site'

export type { CompareDeviceFilter, CompareStatusFilter } from '~/features/compare/state'

// compare.detail's output isn't exported as a named type, so derive it from the
// typed client. compare.run reuses the exported CompareReport schema.
export type CompareDetailReport = Awaited<ReturnType<UnlighthouseClient['compare.detail']>>
export type { CompareRouteRow }
type CompareThresholdPayload = NonNullable<Parameters<UnlighthouseClient['compare.run']>[0]['thresholds']>
type CompareThresholdKey = keyof CompareThresholdPayload

const COMPARE_THRESHOLD_KEYS: ReadonlySet<string> = new Set([
  'performance',
  'accessibility',
  'seo',
  'best-practices',
  'agentic-browsing',
  'lcp',
  'cls',
  'inp',
  'fcp',
  'ttfb',
  'tbt',
  'si',
])

// The cwv pack's base/current payloads are `unknown` in the contract (each pack
// owns its shape); narrow to the fields this view reads.
interface CwvPackMetric {
  metric: string
  p75: number | null
  verdict: string | null
}
interface CwvPackData {
  metrics?: CwvPackMetric[]
}

export interface CwvP75Row {
  metric: string
  baseP75: number | null
  currentP75: number | null
  delta: number | null
  label: string
  verdict: string | null
}

export type CompareRequestState
  = | { _tag: 'idle' }
    | { _tag: 'loading', hasPreviousReport: boolean }
    | { _tag: 'ready' }
    | { _tag: 'partial', error: ApiError }
    | { _tag: 'error', error: ApiError }

type CompareResult<T>
  = | { _tag: 'ok', data: T }
    | { _tag: 'err', error: ApiError }

function isCompareThresholdKey(key: string): key is CompareThresholdKey {
  return COMPARE_THRESHOLD_KEYS.has(key)
}

export function thresholdPayload(thresholds: Record<string, string>): CompareThresholdPayload | undefined {
  const out: CompareThresholdPayload = {}
  for (const [k, v] of Object.entries(thresholds)) {
    if (!isCompareThresholdKey(k))
      continue
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
  const requestUrl = useRequestURL()
  const { copy } = useClipboard({ legacy: true })

  // Site comes off the route param (/sites/:siteId/compare); both scan ids
  // ride the query string (`?current=&base=`) so the whole compare is
  // deep-linkable and refresh-survives.
  const siteId = computed(() => routeParamString(route.params.siteId) ?? '')

  // `undefined` is the "nothing picked" sentinel; once chosen it's a real
  // ScanId, matching both the `value: s.scanId` items the USelect renders and
  // the v-model type the select infers from those items.
  const initialQuery = parseCompareQueryState(route.query)
  const currentScanId = ref<ScanId | undefined>(optionalScanId(route.query.current))
  const baseScanId = ref<ScanId | undefined>(optionalScanId(route.query.base))
  const statusFilter = ref(initialQuery.status)
  const deviceFilter = ref(initialQuery.device)
  const urlFilter = ref(initialQuery.q)
  const page = ref(initialQuery.page)
  const sortKey = ref(initialQuery.sort)

  function compareQuery() {
    return {
      ...route.query,
      current: currentScanId.value || undefined,
      base: baseScanId.value || undefined,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      device: deviceFilter.value || undefined,
      q: urlFilter.value || undefined,
      page: page.value === 1 ? undefined : String(page.value),
      sort: sortKey.value === 'delta-perf-desc' ? undefined : sortKey.value,
    }
  }

  // Sync both picks back into the URL in one navigation — updating them
  // separately would race (each `router.replace` reads the still-stale
  // `route.query` before the previous one resolves) and could drop one of
  // the two writes.
  watch([currentScanId, baseScanId, statusFilter, deviceFilter, urlFilter, page, sortKey], () => {
    void router.replace({ query: compareQuery() })
  })

  // Inbound: Vue Router reuses this component across query-only navigations
  // (e.g. swapDirection, base picks), so browser Back/Forward changes
  // `route.query` without remounting — without this watch the refs (and
  // everything derived from them) go stale vs the address bar. Guarded to
  // only assign on an actual diff so it doesn't fight the outbound sync
  // above (assigning back would just re-replace with the same query).
  watch(() => route.query, (query) => {
    const parsed = parseCompareQueryState(query)
    const nextCurrent = optionalScanId(query.current)
    const nextBase = optionalScanId(query.base)
    if (nextCurrent !== currentScanId.value)
      currentScanId.value = nextCurrent
    if (nextBase !== baseScanId.value)
      baseScanId.value = nextBase
    statusFilter.value = parsed.status
    deviceFilter.value = parsed.device
    urlFilter.value = parsed.q
    page.value = parsed.page
    sortKey.value = parsed.sort
  })

  const { data: currentMeta, error: currentMetaError, status: currentMetaStatus, refresh: refreshCurrentMeta } = useApiQuery(
    'scan.meta',
    () => ({ scanId: currentScanId.value }),
    { enabled: () => !!currentScanId.value },
  )

  const { data: baseMeta, error: baseMetaError, status: baseMetaStatus, refresh: refreshBaseMeta } = useApiQuery(
    'scan.meta',
    () => ({ scanId: baseScanId.value }),
    { enabled: () => !!baseScanId.value },
  )

  // History is loaded with a generous page size so users with many scans can
  // still pick anything from the dropdown without paging. 200 is the server cap;
  // for orgs that exceed it we'd need a search box.
  const { data: history, error: historyError, status: historyStatus, refresh: refreshHistory } = useApiQuery(
    'history.list',
    () => ({ page: 1, pageSize: 200 }),
  )

  // Bootstrap-only origin for a bare `/sites/{slug}/compare` with no
  // `?current` (see the pool-default watch below): the slug can't
  // disambiguate scheme/port, so match it against an actual history row's
  // `site` string instead of reconstructing a URL from it — reconstruction
  // (`resolveSiteUrl` + its `https://{slug}` fallback) is exactly what
  // produces a mismatched origin for http / non-default-port / unregistered
  // sites, which is the bug this derivation exists to avoid.
  const slugOrigin = computed(() => {
    const fromHistory = history.value?.items?.find(s => siteSlug(s.site) === siteId.value)
    return fromHistory ? (originOf(fromHistory.site) ?? fromHistory.site) : null
  })

  // The pool's real origin is the *current* scan's own `site` string once it
  // resolves — the ground truth, unaffected by slug ambiguity. Falls back to
  // slugOrigin only until a `currentScanId` exists to resolve.
  const currentOrigin = computed(() => {
    const site = currentMeta.value?.site
    return site ? (originOf(site) ?? site) : slugOrigin.value
  })

  // Every complete scan of this site — the base pool for both the default
  // "current" pick and the base picker.
  const poolScans = computed(() => {
    if (!history.value?.items || !currentOrigin.value)
      return []
    return history.value.items.filter(s =>
      s.status === 'complete'
      && originOf(s.site) === currentOrigin.value,
    )
  })

  // No `?current` in the URL: default to the site's latest completed scan
  // and write it back so `/sites/{slug}/compare` with no params just works.
  // Doesn't override an explicit URL pick.
  watch(poolScans, (pool) => {
    if (currentScanId.value || !pool.length)
      return
    const latest = [...pool].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    if (latest)
      currentScanId.value = latest.scanId
  }, { immediate: true })

  // Only scans of the same site (excluding current) can produce meaningful
  // route overlap.
  const otherScans = computed(() => poolScans.value.filter(s => s.scanId !== currentScanId.value))
  const currentScans = computed(() => poolScans.value.filter(s => s.scanId !== baseScanId.value))

  // Auto-pick the most recent prior scan on the same site (+ branch if the
  // current scan has one). Doesn't override an explicit URL pick.
  // Gated on currentMeta loading + no explicit base pick; when currentMeta
  // arrives `enabled` flips and the query runs. A failed previous-scan lookup
  // is an optional read and degrades to "no prior scan".
  const { data: autoBase } = useNuxtAsyncQuery<ScanId | null>(
    async () => {
      const meta = currentMeta.value
      const current = currentScanId.value
      if (!meta || !current)
        return null
      return api['compare.findPrevious']({
        site: meta.site,
        device: meta.device,
        branch: meta.ciBranch ?? undefined,
        excludeScanId: current,
      }).then(res => res.scanId ?? null).catch((err) => {
        logOperationalWarn('ui.optional_api_read_failed', err, { command: 'compare.findPrevious', feature: 'compare-workflow' }, console)
        return null
      })
    },
    {
      key: () => `compare-auto:${currentScanId.value}`,
      enabled: () => !!currentMeta.value && !baseScanId.value,
    },
  )

  watch(autoBase, (id) => {
    if (id && !baseScanId.value)
      baseScanId.value = id
  })

  const selectedRowKey = ref<string | null>(null)

  // Threshold UI bound to the same shape compare.detail accepts. Empty string
  // means omit, and the handler falls back to CI defaults.
  const thresholds = reactive<Record<string, string>>({
    'performance': '',
    'accessibility': '',
    'seo': '',
    'best-practices': '',
    'agentic-browsing': '',
    'lcp': '',
    'cls': '',
    'inp': '',
  })

  const report = ref<CompareDetailReport | null>(null)
  // Pack diffs come from compare.run (which is the threshold-based diff path);
  // compare.detail only carries route data. Keep it separate so filter/sort
  // changes do not refetch pack summaries.
  const packReport = ref<CompareReport | null>(null)
  const requestState = ref<CompareRequestState>({ _tag: 'idle' })
  const packError = ref<ApiError | null>(null)
  const copyingMarkdown = ref(false)
  const copyingLink = ref(false)
  const showLegacyMetrics = ref(false)
  const showPackDetails = ref(false)
  const comparing = computed(() => requestState.value._tag === 'loading')
  const compareError = computed(() => requestState.value._tag === 'error' ? requestState.value.error : null)

  const pairCompatibility = computed(() => comparePairCompatibility({
    baseScanId: baseScanId.value,
    currentScanId: currentScanId.value,
    base: baseMeta.value,
    current: currentMeta.value,
  }))

  const currentThresholdPayload = () => thresholdPayload(thresholds)

  async function copyAsMarkdown() {
    const base = baseScanId.value
    const current = currentScanId.value
    if (!base || !current)
      return
    copyingMarkdown.value = true
    await api['compare.markdown']({
      baseScanId: base,
      currentScanId: current,
      thresholds: currentThresholdPayload(),
    })
      .then(async (res) => {
        await copy(res.markdown)
        toast.success(res.hasRegressions ? 'Markdown copied: regressions present' : 'Comparison markdown copied')
      })
      .catch((err) => {
        toast.error('Copy markdown failed', { description: `${err instanceof Error ? err.message : String(err)}. Allow clipboard access and retry.` })
      })
      .finally(() => {
        copyingMarkdown.value = false
      })
  }

  async function copyLink() {
    copyingLink.value = true
    const href = new URL(router.resolve({ path: route.path, query: compareQuery() }).href, requestUrl.origin).toString()
    await copy(href)
      .then(() => toast.success('Comparison link copied'))
      .catch((err) => {
        toast.error('Copy link failed', { description: `${err instanceof Error ? err.message : String(err)}. Allow clipboard access and retry.` })
      })
      .finally(() => {
        copyingLink.value = false
      })
  }

  async function fetchPage(): Promise<CompareResult<CompareDetailReport>> {
    const base = baseScanId.value
    const current = currentScanId.value
    if (!base || !current) {
      return {
        _tag: 'err',
        error: normalizeApiError(new Error('Select both a base and current scan before comparing.')),
      }
    }
    return api['compare.detail']({
      baseScanId: base,
      currentScanId: current,
      page: page.value,
      pageSize: 100,
      sort: sortKey.value,
      filter: {
        url: urlFilter.value || undefined,
        status: statusFilter.value,
        device: deviceFilter.value || undefined,
      },
      thresholds: currentThresholdPayload(),
    })
      .then(data => ({ _tag: 'ok' as const, data }))
      .catch(error => ({ _tag: 'err' as const, error: normalizeApiError(error) }))
  }

  async function fetchPacks(): Promise<CompareResult<CompareReport>> {
    const base = baseScanId.value
    const current = currentScanId.value
    if (!base || !current) {
      return {
        _tag: 'err',
        error: normalizeApiError(new Error('Select both a base and current scan before comparing.')),
      }
    }
    return api['compare.run']({
      baseScanId: base,
      currentScanId: current,
      thresholds: currentThresholdPayload(),
    })
      .then(data => ({ _tag: 'ok' as const, data }))
      .catch((error) => {
        logOperationalWarn('ui.optional_api_read_failed', error, { command: 'compare.run', feature: 'compare-workflow-packs' }, console)
        return { _tag: 'err' as const, error: normalizeApiError(error) }
      })
  }

  const cwvPackDiff = computed(() => {
    if (!packReport.value?.packDiffs)
      return null
    return packReport.value.packDiffs.find(p => p.packName === 'cwv') ?? null
  })

  const cwvP75Rows = computed<CwvP75Row[]>(() => {
    const diff = cwvPackDiff.value
    if (!diff)
      return []
    const baseMetrics = (diff.base as CwvPackData | null)?.metrics ?? []
    const currentMetrics = (diff.current as CwvPackData | null)?.metrics ?? []
    const byMetric = new Map<string, { base?: CwvPackMetric, current?: CwvPackMetric }>()
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
    return packReport.value.packDiffs.filter(p => p.packName !== 'cwv' && p.hasChanges)
  })

  let requestVersion = 0
  async function runComparison(includePacks: boolean) {
    if (pairCompatibility.value._tag !== 'ready')
      return

    const version = ++requestVersion
    requestState.value = { _tag: 'loading', hasPreviousReport: report.value !== null }
    const [detailResult, packResult] = await Promise.all([
      fetchPage(),
      includePacks ? fetchPacks() : Promise.resolve(null),
    ])
    if (version !== requestVersion)
      return

    if (detailResult._tag === 'err') {
      requestState.value = { _tag: 'error', error: detailResult.error }
      return
    }

    report.value = detailResult.data
    const visibleRows = detailResult.data.routes.items
    const selectedStillVisible = visibleRows.some(row => compareRowKey(row) === selectedRowKey.value)
    if (!selectedStillVisible)
      selectedRowKey.value = visibleRows[0] ? compareRowKey(visibleRows[0]) : null

    if (packResult?._tag === 'ok') {
      packReport.value = packResult.data
      packError.value = null
    }
    else if (packResult?._tag === 'err') {
      packError.value = packResult.error
    }

    requestState.value = packError.value
      ? { _tag: 'partial', error: packError.value }
      : { _tag: 'ready' }
  }

  let includePacksOnNextPageChange = false
  function handleCompare() {
    if (page.value !== 1) {
      includePacksOnNextPageChange = true
      page.value = 1
      return
    }
    void runComparison(true)
  }

  function retryComparison() {
    void runComparison(true)
  }

  async function retryPacks() {
    const result = await fetchPacks()
    if (result._tag === 'err') {
      packError.value = result.error
      requestState.value = { _tag: 'partial', error: result.error }
      return
    }
    packReport.value = result.data
    packError.value = null
    requestState.value = { _tag: 'ready' }
  }

  function swapDirection() {
    if (!baseScanId.value)
      return
    const oldCurrent = currentScanId.value
    currentScanId.value = baseScanId.value
    baseScanId.value = oldCurrent
  }

  function onFilterInput(val: string) {
    urlFilter.value = val
  }

  function resetPageAndFetch() {
    if (page.value !== 1) {
      page.value = 1
      return
    }
    void runComparison(false)
  }
  watchDebounced([urlFilter, statusFilter, deviceFilter, sortKey], resetPageAndFetch, { debounce: 300, maxWait: 600 })
  watch(page, () => {
    const includePacks = includePacksOnNextPageChange
    includePacksOnNextPageChange = false
    void runComparison(includePacks)
  })

  function clearFilters() {
    statusFilter.value = 'all'
    deviceFilter.value = ''
    urlFilter.value = ''
    sortKey.value = 'delta-perf-desc'
  }

  const hasMultipleDevices = computed(() => hasMultipleDevicesForScans([currentMeta.value, baseMeta.value]))

  const selectedRow = computed(() => {
    if (!selectedRowKey.value || !report.value)
      return null
    return report.value.routes.items.find(r => compareRowKey(r) === selectedRowKey.value) ?? null
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

  watch([baseScanId, currentScanId, pairCompatibility], ([base, current, compatibility], previous) => {
    const [previousBase, previousCurrent] = previous ?? []
    if (didComparePairChange(
      previous?.length >= 2 ? [previousBase, previousCurrent] : undefined,
      [base, current],
    )) {
      report.value = null
      packReport.value = null
      packError.value = null
      selectedRowKey.value = null
      page.value = 1
    }
    if (compatibility._tag === 'ready')
      void runComparison(true)
    else
      requestState.value = { _tag: 'idle' }
  }, { immediate: true })

  function shortId(id: string | null | undefined): string {
    if (!id)
      return ''
    return id.slice(0, 8)
  }

  function gotoOverview(id: string | undefined) {
    if (!id)
      return
    router.push(`/sites/${siteId.value}/scans/${id}/routes`)
  }

  return {
    siteId,
    currentScanId,
    baseScanId,
    currentMeta,
    currentMetaError,
    currentMetaStatus,
    historyError,
    historyStatus,
    refreshCurrentMeta,
    refreshHistory,
    baseMeta,
    baseMetaError,
    baseMetaStatus,
    refreshBaseMeta,
    otherScans,
    currentScans,
    comparing,
    requestState,
    compareError,
    packError,
    pairCompatibility,
    statusFilter,
    deviceFilter,
    urlFilter,
    page,
    sortKey,
    selectedRowKey,
    thresholds,
    report,
    copyingMarkdown,
    copyingLink,
    showLegacyMetrics,
    showPackDetails,
    copyAsMarkdown,
    copyLink,
    cwvP75Rows,
    otherPackChanges,
    handleCompare,
    retryComparison,
    retryPacks,
    swapDirection,
    onFilterInput,
    clearFilters,
    hasMultipleDevices,
    selectedRow,
    totalPages,
    verdict,
    shortId,
    gotoOverview,
  }
}
