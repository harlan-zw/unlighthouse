import type { CompareReport, CompareRouteRow, ScanId } from '@unlighthouse/contracts'
import type { UnlighthouseClient } from '@unlighthouse/contracts/client'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { compareRowKey } from '~/features/compare/presentation'
import { optionalScanId, routeParamString } from '~/features/scan/route-context'
import { originOf } from '~/features/sites/site-url'
import { siteSlug } from '~/utils/site'

export type CompareStatusFilter = 'all' | 'changed' | 'regressed' | 'improved' | 'added' | 'removed'
export type CompareDeviceFilter = '' | 'mobile' | 'desktop'

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

  // Site comes off the route param (/sites/:siteId/compare); both scan ids
  // ride the query string (`?current=&base=`) so the whole compare is
  // deep-linkable and refresh-survives.
  const siteId = computed(() => routeParamString(route.params.siteId) ?? '')

  // `undefined` is the "nothing picked" sentinel; once chosen it's a real
  // ScanId, matching both the `value: s.scanId` items the USelect renders and
  // the v-model type the select infers from those items.
  const currentScanId = ref<ScanId | undefined>(optionalScanId(route.query.current))
  const baseScanId = ref<ScanId | undefined>(optionalScanId(route.query.base))

  // Sync both picks back into the URL in one navigation — updating them
  // separately would race (each `router.replace` reads the still-stale
  // `route.query` before the previous one resolves) and could drop one of
  // the two writes.
  watch([currentScanId, baseScanId], ([c, b]) => {
    router.replace({ query: { ...route.query, current: c || undefined, base: b || undefined } })
  })

  // Inbound: Vue Router reuses this component across query-only navigations
  // (e.g. swapDirection, base picks), so browser Back/Forward changes
  // `route.query` without remounting — without this watch the refs (and
  // everything derived from them) go stale vs the address bar. Guarded to
  // only assign on an actual diff so it doesn't fight the outbound sync
  // above (assigning back would just re-replace with the same query).
  watch(() => [route.query.current, route.query.base] as const, ([c, b]) => {
    const nextCurrent = optionalScanId(c)
    const nextBase = optionalScanId(b)
    if (nextCurrent !== currentScanId.value)
      currentScanId.value = nextCurrent
    if (nextBase !== baseScanId.value)
      baseScanId.value = nextBase
  })

  const { data: currentMeta, error: currentMetaError, refresh: refreshCurrentMeta } = useApiQuery(
    'scan.meta',
    () => ({ scanId: currentScanId.value }),
    { enabled: () => !!currentScanId.value },
  )

  const { data: baseMeta } = useApiQuery(
    'scan.meta',
    () => ({ scanId: baseScanId.value }),
    { enabled: () => !!baseScanId.value },
  )

  // History is loaded with a generous page size so users with many scans can
  // still pick anything from the dropdown without paging. 200 is the server cap;
  // for orgs that exceed it we'd need a search box.
  const { data: history, error: historyError } = useApiQuery(
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
  const copyingMarkdown = ref(false)
  const showLegacyMetrics = ref(false)
  const showPackDetails = ref(false)

  const currentThresholdPayload = () => thresholdPayload(thresholds)

  async function copyAsMarkdown() {
    const base = baseScanId.value
    const current = currentScanId.value
    if (!base || !current)
      return
    copyingMarkdown.value = true
    try {
      const res = await api['compare.markdown']({
        baseScanId: base,
        currentScanId: current,
        thresholds: currentThresholdPayload(),
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
      toast.success(res.hasRegressions ? 'Copied: regressions present' : 'Copied to clipboard')
    }
    catch (err) {
      toast.error('Copy markdown failed', { description: `${err instanceof Error ? err.message : String(err)}. Allow clipboard access and retry.` })
    }
    finally {
      copyingMarkdown.value = false
    }
  }

  async function fetchPage() {
    const base = baseScanId.value
    const current = currentScanId.value
    if (!base || !current)
      return
    try {
      report.value = await api['compare.detail']({
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
    }
    catch (err) {
      toast.error('Compare scans failed', { description: `${err instanceof Error ? err.message : String(err)}. Check both scans are available and retry.` })
    }
  }

  async function fetchPacks() {
    const base = baseScanId.value
    const current = currentScanId.value
    if (!base || !current)
      return
    try {
      packReport.value = await api['compare.run']({
        baseScanId: base,
        currentScanId: current,
        thresholds: currentThresholdPayload(),
      })
    }
    catch (err) {
      logOperationalWarn('ui.optional_api_read_failed', err, { command: 'compare.run', feature: 'compare-workflow-packs' }, console)
      packReport.value = null
    }
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
    const oldCurrent = currentScanId.value
    currentScanId.value = baseScanId.value
    baseScanId.value = oldCurrent
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
    const devices = new Set(report.value.routes.items.map(r => r.device))
    return devices.size > 1
  })

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
    router.push(`/sites/${siteId.value}/scans/${id}/routes`)
  }

  return {
    siteId,
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
