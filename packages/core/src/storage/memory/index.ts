import type {
  BlobPutOptions,
  BlobStore,
  Device,
  ExtractedMetrics,
  FindPreviousQuery,
  ListQuery,
  Logger,
  PackRun,
  Paginated,
  RouteListQuery,
  Scan,
  ScanId,
  ScanInsert,
  ScanRepository,
  ScanRoute,
  ScanRouteRepository,
  Storage,
} from '@unlighthouse/contracts'
import { createHash } from 'node:crypto'

/**
 * Pure in-memory `Storage`. Used by:
 *  - tests (no fs, no native deps),
 *  - Worker default before user wires real adapters,
 *  - REPL / scratch.
 *
 * Not persistent. Not concurrent-safe across realms.
 */
export interface MemoryStorageOptions {
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

export function memoryStorage(_opts: MemoryStorageOptions = {}): Storage {
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

  const clone = <T>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)) as T)

  function urlHash(url: string): string {
    return createHash('sha1').update(url).digest('hex').slice(0, 16)
  }

  function toRoute(scanId: string, device: Device, m: ExtractedMetrics): ScanRoute {
    return {
      ...clone(m),
      scanId: scanId as ScanId,
      device,
      lhrBlobKey: `scans/${scanId}/lhr/${urlHash(m.url)}-${device}.json.gz`,
    } as ScanRoute
  }

  const routeKey = (url: string, device: Device) => `${url}|${device}`

  const scanRepo: ScanRepository = {
    async create(scan: ScanInsert): Promise<Scan> {
      const full: Scan = {
        ...clone(scan),
        completedAt: scan.completedAt ?? null,
        summary: (scan.summary ?? null) as Scan['summary'],
      } as Scan
      scansMap.set(full.scanId, { ...full, _createdAtMs: Date.now() })
      return clone(full)
    },
    async get(scanId) {
      const cur = scansMap.get(scanId)
      if (!cur)
        return null
      const { _createdAtMs: _x, ...out } = cur
      return clone(out as Scan)
    },
    async update(scanId, patch) {
      const cur = scansMap.get(scanId)
      if (!cur)
        throw new Error(`Scan not found: ${scanId}`)
      const next = { ...cur, ...clone(patch) } as Scan & { _createdAtMs: number }
      scansMap.set(scanId, next)
      const { _createdAtMs: _x, ...out } = next
      return clone(out as Scan)
    },
    async findPrevious(q: FindPreviousQuery) {
      const matches = Array.from(scansMap.values())
        .filter(s => s.site === q.site && s.device === q.device && s.status === 'complete')
        .filter(s => q.branch === undefined || s.ciBranch === q.branch)
        .filter(s => q.excludeScanId === undefined || s.scanId !== q.excludeScanId)
        .sort((a, b) => (b.startedAt > a.startedAt ? 1 : b.startedAt < a.startedAt ? -1 : b._createdAtMs - a._createdAtMs))
      if (!matches[0])
        return null
      const { _createdAtMs: _x, ...out } = matches[0]
      return clone(out as Scan)
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
        .map(({ _createdAtMs: _x, ...rest }) => clone(rest as Scan))
      return { items, total, page, pageSize }
    },
    async delete(scanId) {
      scansMap.delete(scanId)
      routesMap.delete(scanId)
    },
  }

  const routeRepo: ScanRouteRepository = {
    async putBatch(scanId, device, rows: ExtractedMetrics[]) {
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
        const scoreCol = {
          'performance': 'scorePerformance',
          'accessibility': 'scoreAccessibility',
          'seo': 'scoreSeo',
          'best-practices': 'scoreBestPractices',
        } as const
        all = all.filter((r) => {
          if (f.urlPattern && !r.url.includes(f.urlPattern))
            return false
          if (f.minScore) {
            for (const [cat, min] of Object.entries(f.minScore)) {
              const v = (r as unknown as Record<string, number | null>)[scoreCol[cat as keyof typeof scoreCol]]
              if (v == null || v < (min as number))
                return false
            }
          }
          if (f.maxMetric) {
            for (const [metric, max] of Object.entries(f.maxMetric)) {
              const v = (r as unknown as Record<string, number | null>)[metric]
              if (v != null && v > (max as number))
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
    async has(key) {
      return blobsMap.has(key)
    },
    async delete(key) {
      blobsMap.delete(key)
    },
  }

  // Report-side aggregations have no in-memory implementation — they're
  // produced by `core/report/processScanData` against a SQL adapter. Stub
  // empty so cloudflare/test environments using memory storage degrade to
  // "no dashboard data" rather than crashing handlers.
  const emptyList = { list: async () => [] }
  const reportRepos = {
    accessibility: emptyList,
    accessibilityElements: emptyList,
    missingAltImages: emptyList,
    performance: emptyList,
    thirdPartyScripts: emptyList,
    lcpElements: emptyList,
    seoMeta: emptyList,
    seoDuplicates: emptyList,
    canonicalChains: emptyList,
    linkTextIssues: emptyList,
    tapTargetIssues: emptyList,
    bestPracticesSecurity: emptyList,
    bestPracticesLibraries: emptyList,
    bestPracticesVulnerable: emptyList,
    bestPracticesDeprecated: emptyList,
    bestPracticesConsoleErrors: emptyList,
    crux: emptyList,
    dashboardSummary: { get: async () => null },
  } as Storage['reports']

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

  return { scans: scanRepo, routes: routeRepo, blobs: blobStore, reports: reportRepos, comparisons: comparisonsRepo, packRuns: packRunsRepo }
}
