import type {
  BlobPutOptions,
  BlobStore,
  ExtractedMetrics,
  FindPreviousQuery,
  ListQuery,
  Logger,
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
  const routesMap = new Map<ScanId, Map<string, ScanRoute>>()
  const blobsMap = new Map<string, Uint8Array>()

  const clone = <T>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)) as T)

  function urlHash(url: string): string {
    return createHash('sha1').update(url).digest('hex').slice(0, 16)
  }

  function toRoute(scanId: string, m: ExtractedMetrics): ScanRoute {
    return {
      ...clone(m),
      scanId: scanId as ScanId,
      lhrBlobKey: `scans/${scanId}/lhr/${urlHash(m.url)}.json.gz`,
    } as ScanRoute
  }

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
    async putBatch(scanId, rows: ExtractedMetrics[]) {
      const map = routesMap.get(scanId) ?? new Map<string, ScanRoute>()
      for (const m of rows)
        map.set(m.url, toRoute(scanId, m))
      routesMap.set(scanId, map)
    },
    async upsert(scanId, row) {
      const map = routesMap.get(scanId) ?? new Map<string, ScanRoute>()
      map.set(row.url, toRoute(scanId, row))
      routesMap.set(scanId, map)
    },
    async listForScan(scanId, q?: RouteListQuery): Promise<Paginated<ScanRoute>> {
      const page = Math.max(1, q?.page ?? 1)
      const pageSize = Math.max(1, q?.pageSize ?? 100)
      const all = Array.from(routesMap.get(scanId)?.values() ?? [])
      const total = all.length
      const items = all.slice((page - 1) * pageSize, page * pageSize).map(clone)
      return { items, total, page, pageSize }
    },
    async get(scanId, url) {
      const r = routesMap.get(scanId)?.get(url)
      return r ? clone(r) : null
    },
    async delete(scanId, url) {
      if (url == null) {
        routesMap.delete(scanId)
        return
      }
      routesMap.get(scanId)?.delete(url)
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

  return { scans: scanRepo, routes: routeRepo, blobs: blobStore, reports: reportRepos, comparisons: comparisonsRepo }
}
