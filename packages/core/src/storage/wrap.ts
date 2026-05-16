import type {
  BlobPutOptions,
  BlobStore,
  ExtractedMetrics,
  FindPreviousQuery,
  ListQuery,
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

/**
 * Generic Storage interceptor. Wraps any `Storage` and fires before/after hooks
 * around every public method. The wrapper is intentionally agnostic about *what*
 * the hooks do — hosts use it for tenant filtering, audit logging, request-level
 * caching, encryption, whatever — without core having to know.
 *
 * The op object is mutable: hooks may rewrite `args` before the call and `result`
 * after the call. Return values from hooks are ignored; mutate the op directly.
 *
 * Performance note: for SQL adapters, hook-based post-filtering is O(rows-fetched).
 * If you need WHERE-clause push-down, hook into the adapter at construction
 * (adapter-specific) instead of using this generic wrapper.
 */
export interface StorageOp<TArgs = unknown, TResult = unknown> {
  /** Dotted method name, e.g. `'scans.list'`, `'routes.putBatch'`, `'blobs.get'`. */
  readonly name: string
  /** Mutable inputs. Hooks may rewrite these before the adapter runs. */
  args: TArgs
  /** Mutable output. Adapters set this before `query:after`; hooks may replace it. */
  result?: TResult
  /** Opaque per-request context (typically `HandlerCtx.tenant` or similar). */
  ctx?: unknown
}

export type StorageHook = (op: StorageOp) => void | Promise<void>

export interface StorageHooks {
  /** Fires before each method runs. Mutate `op.args` to rewrite inputs. */
  before?: StorageHook[]
  /** Fires after each method runs. Mutate `op.result` to rewrite outputs. */
  after?: StorageHook[]
}

export interface WrapStorageOptions {
  hooks: StorageHooks
  /** Opaque per-request context attached to every op (e.g. `{ tenantId }`). */
  ctx?: unknown
}

async function run(hooks: StorageHook[] | undefined, op: StorageOp): Promise<void> {
  if (!hooks?.length)
    return
  for (const h of hooks) await h(op)
}

export function wrapStorage(base: Storage, opts: WrapStorageOptions): Storage {
  const { hooks, ctx } = opts
  const { before, after } = hooks

  async function intercept<TArgs, TResult>(
    name: string,
    args: TArgs,
    run_: (args: TArgs) => Promise<TResult>,
  ): Promise<TResult> {
    const op: StorageOp<TArgs, TResult> = { name, args, ctx }
    await run(before, op as StorageOp)
    op.result = await run_(op.args)
    await run(after, op as StorageOp)
    return op.result as TResult
  }

  const scans: ScanRepository = {
    create: (scan: ScanInsert) => intercept('scans.create', { scan }, a => base.scans.create(a.scan)),
    get: (scanId: ScanId) => intercept('scans.get', { scanId }, a => base.scans.get(a.scanId)),
    update: (scanId, patch) => intercept('scans.update', { scanId, patch }, a => base.scans.update(a.scanId, a.patch)),
    findPrevious: (q: FindPreviousQuery) => intercept('scans.findPrevious', { q }, a => base.scans.findPrevious(a.q)),
    list: (q: ListQuery): Promise<Paginated<Scan>> => intercept('scans.list', { q }, a => base.scans.list(a.q)),
    delete: (scanId: ScanId) => intercept('scans.delete', { scanId }, a => base.scans.delete(a.scanId)),
  }

  const routes: ScanRouteRepository = {
    putBatch: (scanId: ScanId, device, rows: ExtractedMetrics[]) =>
      intercept('routes.putBatch', { scanId, device, rows }, a => base.routes.putBatch(a.scanId, a.device, a.rows)),
    upsert: (scanId, device, row) => intercept('routes.upsert', { scanId, device, row }, a => base.routes.upsert(a.scanId, a.device, a.row)),
    listForScan: (scanId: ScanId, q?: RouteListQuery): Promise<Paginated<ScanRoute>> =>
      intercept('routes.listForScan', { scanId, q }, a => base.routes.listForScan(a.scanId, a.q)),
    get: (scanId, url, device) => intercept('routes.get', { scanId, url, device }, a => base.routes.get(a.scanId, a.url, a.device)),
    delete: (scanId, url, device) => intercept('routes.delete', { scanId, url, device }, a => base.routes.delete(a.scanId, a.url, a.device)),
  }

  const blobs: BlobStore = {
    put: (key: string, data: Uint8Array, options?: BlobPutOptions) =>
      intercept('blobs.put', { key, data, options }, a => base.blobs.put(a.key, a.data, a.options)),
    get: (key: string) => intercept('blobs.get', { key }, a => base.blobs.get(a.key)),
    has: (key: string) => intercept('blobs.has', { key }, a => base.blobs.has(a.key)),
    delete: (key: string) => intercept('blobs.delete', { key }, a => base.blobs.delete(a.key)),
  }

  // Report + comparison repos are read-only & dashboard-private; pass through
  // without intercepting. Tenant/auth hooks already gate via `scans.*` /
  // `routes.*` (any scanId reaching `reports.*` was filtered upstream).
  // packRuns goes through too — the cache is keyed on `scanId` and any
  // scan-level access control would already have been applied upstream.
  return { scans, routes, blobs, reports: base.reports, comparisons: base.comparisons, packRuns: base.packRuns }
}
