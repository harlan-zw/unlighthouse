import type { PackRun } from '@unlighthouse/contracts/packs'
import type {
  BlobPutOptions,
  BlobStore,
  FindPreviousQuery,
  ListQuery,
  Logger,
  RouteListQuery,
  ScanInsert,
  ScanRepository,
  ScanRouteRepository,
  ScanRouteWrite,
  SiteRecord,
  SiteRepository,
  Storage,
} from '@unlighthouse/contracts/ports'
import type {
  Category,
  Device,
  MetricName,
  Paginated,
  Scan,
  ScanId,
  ScanRoute,
} from '@unlighthouse/contracts/types/atoms'
import { ScanRouteSchema, ScanSchema } from '@unlighthouse/contracts/types/atoms'
import { routeArtifactKeys } from '../artifact-keys'

const SCORE_FILTER_KEYS = ['performance', 'accessibility', 'seo', 'best-practices', 'agentic-browsing'] as const satisfies readonly Category[]
const SCORE_FILTER_COLUMNS = {
  'performance': 'scorePerformance',
  'accessibility': 'scoreAccessibility',
  'seo': 'scoreSeo',
  'best-practices': 'scoreBestPractices',
  'agentic-browsing': 'scoreAgenticBrowsing',
} as const satisfies Record<Category, keyof ScanRoute>

const METRIC_FILTER_KEYS = ['lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si'] as const satisfies readonly MetricName[]
const METRIC_FILTER_COLUMNS = {
  lcp: 'lcp',
  cls: 'cls',
  inp: 'inp',
  fcp: 'fcp',
  ttfb: 'ttfb',
  tbt: 'tbt',
  si: 'si',
} as const satisfies Record<MetricName, keyof ScanRoute>

function numericRouteValue(route: ScanRoute, column: keyof ScanRoute): number | null {
  const value = route[column]
  return typeof value === 'number' ? value : null
}

/**
 * Pure in-memory `Storage`. Used by:
 *  - tests (no fs, no native deps),
 *  - lightweight custom hosts before they wire persistent adapters,
 *  - REPL / scratch.
 *
 * Not persistent. Not concurrent-safe across realms.
 */
export interface MemoryStorageOptions {
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

export function memoryStorage(_opts: MemoryStorageOptions = {}): Storage {
  const sitesMap = new Map<string, SiteRecord>()
  const scansMap = new Map<ScanId, Scan & { _createdAtMs: number }>()
  // D-029: keyed on `${url}|${device}` so the same URL on mobile + desktop
  // each carry their own row, mirroring the SQL PK.
  const routesMap = new Map<ScanId, Map<string, ScanRoute>>()
  const blobsMap = new Map<string, Uint8Array>()
  // (scanId, packName, packVersion) → PackRun. Composite key as a string —
  // memory storage doesn't need to be index-friendly.
  const packRunsMap = new Map<string, PackRun>()
  const packRunKey = (scanId: ScanId, name: string, version: string) =>
    `${scanId}::${name}::${version}`

  const clone = <T>(value: T): T => structuredClone(value)

  function fromStoredScan(stored: Scan & { _createdAtMs: number }): Scan {
    const { _createdAtMs: _created, ...scan } = stored
    return ScanSchema.parse(scan)
  }

  function toRoute(scanId: ScanId, device: Device, m: ScanRouteWrite): ScanRoute {
    const keys = routeArtifactKeys(scanId, m.url, device)
    return ScanRouteSchema.parse({
      ...clone(m),
      scanId,
      device,
      lhrBlobKey: m.lhrBlobKey ?? keys.lhr,
      reportBlobKey: m.reportBlobKey === undefined ? keys.report : m.reportBlobKey,
      screenshotBlobKey: m.screenshotBlobKey ?? null,
    })
  }

  const routeKey = (url: string, device: Device) => `${url}|${device}`

  const scanRepo: ScanRepository = {
    async create(scan: ScanInsert): Promise<Scan> {
      const full = ScanSchema.parse({
        ...clone(scan),
        siteId: scan.siteId ?? null,
        mode: scan.mode ?? 'site',
        completedAt: scan.completedAt ?? null,
        summary: scan.summary ?? null,
      })
      scansMap.set(full.scanId, { ...full, _createdAtMs: Date.now() })
      return clone(full)
    },
    async get(scanId) {
      const cur = scansMap.get(scanId)
      if (!cur)
        return null
      return clone(fromStoredScan(cur))
    },
    async update(scanId, patch) {
      const cur = scansMap.get(scanId)
      if (!cur)
        throw new Error(`Scan not found: ${scanId}`)
      const next = {
        ...ScanSchema.parse({ ...cur, ...clone(patch) }),
        _createdAtMs: cur._createdAtMs,
      }
      scansMap.set(scanId, next)
      return clone(fromStoredScan(next))
    },
    async findPrevious(q: FindPreviousQuery) {
      const matches = Array.from(scansMap.values())
        .filter(s => s.site === q.site && s.device === q.device && s.status === 'complete')
        .filter(s => q.branch === undefined || s.ciBranch === q.branch)
        .filter(s => q.excludeScanId === undefined || s.scanId !== q.excludeScanId)
        .sort((a, b) => (b.startedAt > a.startedAt ? 1 : b.startedAt < a.startedAt ? -1 : b._createdAtMs - a._createdAtMs))
      if (!matches[0])
        return null
      return clone(fromStoredScan(matches[0]))
    },
    async list(q: ListQuery): Promise<Paginated<Scan>> {
      const page = Math.max(1, q.page ?? 1)
      const pageSize = Math.max(1, q.pageSize ?? 50)
      const filtered = Array.from(scansMap.values()).filter((s) => {
        if (q.site && s.site !== q.site)
          return false
        if (q.device && s.device !== q.device)
          return false
        if (q.branch && s.ciBranch !== q.branch)
          return false
        if (q.status && s.status !== q.status)
          return false
        return true
      }).sort((a, b) => (b.startedAt > a.startedAt ? 1 : b.startedAt < a.startedAt ? -1 : b._createdAtMs - a._createdAtMs))
      const total = filtered.length
      const items = filtered
        .slice((page - 1) * pageSize, page * pageSize)
        .map(stored => clone(fromStoredScan(stored)))
      return { items, total, page, pageSize }
    },
    async delete(scanId) {
      scansMap.delete(scanId)
      routesMap.delete(scanId)
      const prefix = `${scanId}::`
      for (const key of packRunsMap.keys()) {
        if (key.startsWith(prefix))
          packRunsMap.delete(key)
      }
    },
  }

  const routeRepo: ScanRouteRepository = {
    async putBatch(scanId, device, rows: ScanRouteWrite[]) {
      const map = routesMap.get(scanId) ?? new Map<string, ScanRoute>()
      for (const m of rows)
        map.set(routeKey(m.url, device), toRoute(scanId, device, m))
      routesMap.set(scanId, map)
    },
    async upsert(scanId, device, row) {
      const map = routesMap.get(scanId) ?? new Map<string, ScanRoute>()
      map.set(routeKey(row.url, device), toRoute(scanId, device, row))
      routesMap.set(scanId, map)
    },
    async listForScan(scanId, q?: RouteListQuery): Promise<Paginated<ScanRoute>> {
      const page = Math.max(1, q?.page ?? 1)
      const pageSize = Math.max(1, q?.pageSize ?? 100)
      let all = Array.from(routesMap.get(scanId)?.values() ?? [])
      if (q?.device)
        all = all.filter(r => r.device === q.device)
      // Filter/sort push-down for the memory adapter — same semantics the
      // drizzle adapter pushes to SQL. Kept in lock-step so behaviour
      // matches between hosts.
      if (q?.filter) {
        const f = q.filter
        all = all.filter((r) => {
          if (f.urlPattern && !r.url.includes(f.urlPattern))
            return false
          if (f.minScore) {
            for (const category of SCORE_FILTER_KEYS) {
              const min = f.minScore[category]
              if (typeof min !== 'number')
                continue
              const v = numericRouteValue(r, SCORE_FILTER_COLUMNS[category])
              if (v == null || v < min)
                return false
            }
          }
          if (f.maxMetric) {
            for (const metric of METRIC_FILTER_KEYS) {
              const max = f.maxMetric[metric]
              if (typeof max !== 'number')
                continue
              const v = numericRouteValue(r, METRIC_FILTER_COLUMNS[metric])
              if (v != null && v > max)
                return false
            }
          }
          return true
        })
      }
      if (q?.sort) {
        const copy = [...all]
        copy.sort((a, b) => {
          switch (q.sort) {
            case 'score-asc': return (a.scorePerformance ?? 0) - (b.scorePerformance ?? 0)
            case 'score-desc': return (b.scorePerformance ?? 0) - (a.scorePerformance ?? 0)
            case 'lcp-asc': return (a.lcp ?? Infinity) - (b.lcp ?? Infinity)
            case 'lcp-desc': return (b.lcp ?? -Infinity) - (a.lcp ?? -Infinity)
            case 'url-asc': return a.url.localeCompare(b.url)
            case 'capturedAt-desc': return b.capturedAt.localeCompare(a.capturedAt)
            default: return 0
          }
        })
        all = copy
      }
      const total = all.length
      const items = all.slice((page - 1) * pageSize, page * pageSize).map(clone)
      return { items, total, page, pageSize }
    },
    async findByPath(scanId, path) {
      return Array.from(routesMap.get(scanId)?.values() ?? [])
        .filter(route => route.path === path)
        .sort((a, b) => a.device.localeCompare(b.device))
        .map(clone)
    },
    async get(scanId, url, device) {
      const r = routesMap.get(scanId)?.get(routeKey(url, device))
      return r ? clone(r) : null
    },
    async delete(scanId, url, device) {
      if (url == null) {
        routesMap.delete(scanId)
        return
      }
      const map = routesMap.get(scanId)
      if (!map)
        return
      if (device) {
        map.delete(routeKey(url, device))
        return
      }
      // Drop every device row for this URL.
      for (const key of map.keys()) {
        if (key === url || key.startsWith(`${url}|`))
          map.delete(key)
      }
    },
  }

  const blobStore: BlobStore = {
    async put(key, data, _opts?: BlobPutOptions) {
      blobsMap.set(key, new Uint8Array(data))
    },
    async get(key) {
      const v = blobsMap.get(key)
      return v ? new Uint8Array(v) : null
    },
    async getStream(key) {
      const v = blobsMap.get(key)
      if (!v)
        return null
      const bytes = new Uint8Array(v)
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
      })
    },
    async has(key) {
      return blobsMap.has(key)
    },
    async delete(key) {
      blobsMap.delete(key)
    },
    async list(prefix) {
      return Array.from(blobsMap.keys()).filter(k => k.startsWith(prefix))
    },
  }

  // Report-side aggregations have no in-memory implementation. Stub empty so
  // cloudflare/test environments degrade to "no dashboard data" instead of
  // crashing handlers.
  const emptyList = { list: async () => [] }
  const reportRepos: Storage['reports'] = {
    crux: emptyList,
  }

  const comparisonsRepo: Storage['comparisons'] = {
    async list() { return [] },
    async get() { return null },
    async latestForCurrent() { return null },
    async diffs() { return [] },
  }

  const packRunsRepo: Storage['packRuns'] = {
    async get(scanId, name, version) {
      const r = packRunsMap.get(packRunKey(scanId, name, version))
      return r ? clone(r) : null
    },
    async put(run) {
      packRunsMap.set(packRunKey(run.scanId, run.packName, run.packVersion), clone(run))
    },
    async listForScan(scanId) {
      const prefix = `${scanId}::`
      return Array.from(packRunsMap.entries())
        .filter(([k]) => k.startsWith(prefix))
        .map(([, v]) => clone(v))
    },
    async delete(scanId, name) {
      const prefix = name ? `${scanId}::${name}::` : `${scanId}::`
      for (const k of [...packRunsMap.keys()]) {
        if (k.startsWith(prefix))
          packRunsMap.delete(k)
      }
    },
  }

  const sitesRepo: SiteRepository = {
    async list() { return Array.from(sitesMap.values()).map(clone) },
    async get(id) {
      const s = sitesMap.get(id)
      return s ? clone(s) : null
    },
    async getByUrl(url) {
      const s = Array.from(sitesMap.values()).find(s => s.url === url)
      return s ? clone(s) : null
    },
    async create(site) {
      sitesMap.set(site.id, clone(site))
      return clone(site)
    },
    async update(id, patch) {
      const s = sitesMap.get(id)
      if (!s)
        return null
      Object.assign(s, patch)
      return clone(s)
    },
    async delete(id) { return sitesMap.delete(id) },
  }

  return { sites: sitesRepo, scans: scanRepo, routes: routeRepo, blobs: blobStore, reports: reportRepos, comparisons: comparisonsRepo, packRuns: packRunsRepo }
}
