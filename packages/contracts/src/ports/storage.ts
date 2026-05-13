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

export interface RouteListQuery {
  page?: number
  pageSize?: number
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
  /** Hot path; must be transactional. */
  putBatch: (scanId: ScanId, rows: ExtractedMetrics[]) => Promise<void>
  /** route.rescan path. */
  upsert: (scanId: ScanId, row: ExtractedMetrics) => Promise<void>
  listForScan: (scanId: ScanId, q?: RouteListQuery) => Promise<Paginated<ScanRoute>>
  get: (scanId: ScanId, url: string) => Promise<ScanRoute | null>
  delete: (scanId: ScanId, url?: string) => Promise<void>
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

export interface Storage {
  scans: ScanRepository
  routes: ScanRouteRepository
  blobs: BlobStore
}
