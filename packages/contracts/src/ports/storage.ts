import type { PackRun } from '../packs'
import type {
  Device,
  ExtractedMetrics,
  Paginated,
  Scan,
  ScanId,
  ScanRoute,
  ScanStatus,
  ScanSummary,
} from '../types/atoms'

export type {
  Device,
  ExtractedMetrics,
  PackRun,
  Paginated,
  Scan,
  ScanId,
  ScanRoute,
  ScanStatus,
  ScanSummary,
}

// Insert shape: persisted Scan minus server-managed fields.
// @TODO: tighten to a Zod-inferred ScanInsert once contracts/types adds it.
export type ScanInsert = Omit<Scan, 'completedAt' | 'summary'> & {
  completedAt?: Scan['completedAt']
  summary?: Scan['summary']
}

export interface ListQuery {
  page?: number
  pageSize?: number
  site?: string
  device?: Device
  branch?: string
  status?: ScanStatus
  [k: string]: unknown
}

/**
 * Sort modes pushed to the storage adapter. Storage implementations that
 * understand them issue a real `ORDER BY` clause; ones that don't fall back
 * to the application-side sort the API handler does on the page slice.
 *
 * The set mirrors the wire format on `scan.results.input.sort` /
 * `query.routes.input.sort` 1:1 — kept in sync by convention.
 */
export type RouteSort
  = | 'score-asc'
    | 'score-desc'
    | 'lcp-asc'
    | 'lcp-desc'
    | 'url-asc'
    | 'capturedAt-desc'

/**
 * Filters that storage adapters can push down to SQL. The application-side
 * fallback in api/handlers/scan.ts honours the same shape so behaviour stays
 * identical whether or not the adapter implements push-down.
 */
export interface RouteFilter {
  /**
   * Lighthouse category id → minimum score (0..1). A row matches when every
   * listed category column is ≥ the threshold (null columns excluded).
   */
  minScore?: Partial<Record<'performance' | 'accessibility' | 'seo' | 'best-practices', number>>
  /**
   * Metric column id → maximum value. A row matches when every listed metric
   * is ≤ the threshold (null columns ignored — "no data" is not "too high").
   */
  maxMetric?: Partial<Record<'lcp' | 'cls' | 'inp' | 'fcp' | 'ttfb' | 'tbt' | 'si', number>>
  /**
   * URL substring (case-sensitive). SQL adapters use `url LIKE '%pattern%'`;
   * the wire field on `scan.results` allows a regex source — push-down
   * matches the literal substring fast path, falls back to the API handler's
   * RegExp for anything fancier.
   */
  urlPattern?: string
}

export interface RouteListQuery {
  page?: number
  pageSize?: number
  // D-029: optional device filter. Omitted = aggregate across the matrix
  // (every row, every device). `pack.run` / `scan.results` callers that want
  // a specific device pass it here; the wire on those commands carries the
  // same optional field.
  device?: Device
  /**
   * Storage-side filter push-down (see RouteFilter). Adapters that can't
   * push-down ignore this and let the API handler filter the page slice
   * in JS — behaviour is identical, perf differs at 10k+ rows.
   */
  filter?: RouteFilter
  /**
   * Storage-side sort. Same fallback semantics as `filter`.
   */
  sort?: RouteSort
  [k: string]: unknown
}

export interface FindPreviousQuery {
  site: string
  device: Device
  branch?: string
  excludeScanId?: string
}

export interface ScanRepository {
  create: (scan: ScanInsert) => Promise<Scan>
  get: (scanId: ScanId) => Promise<Scan | null>
  update: (scanId: ScanId, patch: Partial<ScanInsert>) => Promise<Scan>
  findPrevious: (q: FindPreviousQuery) => Promise<Scan | null>
  list: (q: ListQuery) => Promise<Paginated<Scan>>
  delete: (scanId: ScanId) => Promise<void>
}

export interface ScanRouteRepository {
  /**
   * Hot path; must be transactional.
   * D-029: `device` is part of the row identity. Single-device callers pass
   * the scan's only device; matrix callers fan out per-device. Default of
   * 'mobile' keeps signatures non-breaking for legacy single-device flows.
   */
  putBatch: (scanId: ScanId, device: Device, rows: ExtractedMetrics[]) => Promise<void>
  /** route.rescan path. */
  upsert: (scanId: ScanId, device: Device, row: ExtractedMetrics) => Promise<void>
  listForScan: (scanId: ScanId, q?: RouteListQuery) => Promise<Paginated<ScanRoute>>
  /** Returns one row. Device is required: rows are PK'd on (scanId, url, device). */
  get: (scanId: ScanId, url: string, device: Device) => Promise<ScanRoute | null>
  /** Selective delete. Omit `url` to drop every row for the scan. Omit `device` (but provide url) to drop every device row for that URL. */
  delete: (scanId: ScanId, url?: string, device?: Device) => Promise<void>
}

export interface BlobPutOptions {
  ttl?: number
  contentType?: string
}

export interface BlobStore {
  put: (key: string, data: Uint8Array, opts?: BlobPutOptions) => Promise<void>
  get: (key: string) => Promise<Uint8Array | null>
  has: (key: string) => Promise<boolean>
  delete: (key: string) => Promise<void>
}

// ============================================================================
// Report-side repositories (dashboard-private aggregations).
//
// Row shapes are `$inferSelect` types from `./drizzle/sqlite`. Listed as
// `unknown` here to keep this port file free of drizzle imports — the SQL
// adapter narrows to concrete row types via module augmentation in
// `@unlighthouse/core/storage/drizzle` consumers. dashboards do their own
// JSON-parsing of text columns (matches v0 behavior).
// ============================================================================

export interface ReportListRepository<Row> {
  list: (scanId: ScanId) => Promise<Row[]>
}

export interface ReportRepositories {
  accessibility: ReportListRepository<unknown>
  accessibilityElements: ReportListRepository<unknown>
  missingAltImages: ReportListRepository<unknown>
  performance: ReportListRepository<unknown>
  thirdPartyScripts: ReportListRepository<unknown>
  lcpElements: ReportListRepository<unknown>
  seoMeta: ReportListRepository<unknown>
  seoDuplicates: ReportListRepository<unknown>
  canonicalChains: ReportListRepository<unknown>
  linkTextIssues: ReportListRepository<unknown>
  tapTargetIssues: ReportListRepository<unknown>
  bestPracticesSecurity: ReportListRepository<unknown>
  bestPracticesLibraries: ReportListRepository<unknown>
  bestPracticesVulnerable: ReportListRepository<unknown>
  bestPracticesDeprecated: ReportListRepository<unknown>
  bestPracticesConsoleErrors: ReportListRepository<unknown>
  crux: ReportListRepository<unknown>
  dashboardSummary: { get: (scanId: ScanId) => Promise<unknown | null> }
}

export interface ComparisonListQuery {
  site?: string
  baseScanId?: ScanId
  currentScanId?: ScanId
}

export interface ComparisonRepository {
  /** Lists comparison header rows. Diffs are fetched separately. */
  list: (q: ComparisonListQuery) => Promise<unknown[]>
  get: (id: number) => Promise<unknown | null>
  /** Latest comparison whose `currentScanId === scanId`, with diffs joined. */
  latestForCurrent: (scanId: ScanId) => Promise<unknown | null>
  diffs: (comparisonId: number) => Promise<unknown[]>
}

// Pack run cache (D-028). Scans are immutable, so (scanId, packName, packVersion)
// uniquely identifies a reconciliation output — once written, it never changes.
// Bumping the pack version invalidates the cache implicitly.
export interface PackRunRepository {
  get: (scanId: ScanId, packName: string, packVersion: string) => Promise<PackRun | null>
  put: (run: PackRun) => Promise<void>
  listForScan: (scanId: ScanId) => Promise<PackRun[]>
  delete: (scanId: ScanId, packName?: string) => Promise<void>
}

export interface Storage {
  scans: ScanRepository
  routes: ScanRouteRepository
  blobs: BlobStore
  reports: ReportRepositories
  comparisons: ComparisonRepository
  packRuns: PackRunRepository
}
