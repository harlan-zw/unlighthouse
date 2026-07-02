// D-044: scan-history retention, enforced once in core over the Storage port so
// every backend (better-sqlite3, libsql, D1, memory) inherits identical
// behaviour. Pure over `Storage` — no fs, no direct sqlite, no key derivation:
// a scan's namespaced blobs are enumerated via `blobs.list('scans/<id>/')`.

import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { Storage } from '@unlighthouse/contracts/ports'
import type { Scan, ScanId } from '@unlighthouse/contracts/types/atoms'

/** Resolved retention policy — the config slice `pruneScans` acts on. */
export type Retention = NonNullable<UnlighthouseConfig['retention']>

/** Why a scan was selected for pruning. `count` = over `maxScansPerSite`; `age` = older than `maxAgeDays`. */
export type PruneReason = 'count' | 'age'

export interface PruneScanDeletion {
  scanId: ScanId
  site: string
  startedAt: string
  reasons: PruneReason[]
  /** Namespaced blob keys that were (dry-run: would be) deleted for this scan. */
  blobKeys: string[]
}

export interface PruneSiteResult {
  site: string
  /** Total scans considered for this site. */
  considered: number
  /** Scans deleted (dry-run: would be deleted). */
  deleted: number
  /** Scans that matched a rule but were protected as a comparison baseline. */
  protectedBaselines: number
  /** Deleted scan ids, oldest-first. */
  scanIds: ScanId[]
}

export interface PruneResult {
  dryRun: boolean
  /** Total scans deleted (or that would be) across all sites. */
  totalScansDeleted: number
  /** Total blobs deleted (or that would be) across all sites. */
  totalBlobsDeleted: number
  /** Every deletion, oldest-first per site. */
  deletions: PruneScanDeletion[]
  /** Per-site rollup. */
  perSite: PruneSiteResult[]
}

export interface PruneOptions {
  /** When true, report what would be deleted without mutating storage. */
  dryRun?: boolean
  /** Injected clock (ms since epoch) for `maxAgeDays`. Defaults to `Date.now()`. */
  now?: number
  /** Page size for walking the scan list. Defaults to 500. */
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 500
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Read every scan across all sites, paginating the Storage port. */
async function listAllScans(storage: Storage, pageSize: number): Promise<Scan[]> {
  const out: Scan[] = []
  let page = 1
  // Guard against a mis-reporting adapter looping forever: bound by `total`.
  while (true) {
    const res = await storage.scans.list({ page, pageSize })
    out.push(...res.items)
    if (out.length >= res.total || res.items.length === 0)
      break
    page += 1
  }
  return out
}

function startedAtMs(scan: Scan): number {
  const t = Date.parse(scan.startedAt)
  return Number.isNaN(t) ? 0 : t
}

/**
 * Compute + apply retention. Returns a structured result describing what was
 * (or, under `dryRun`, would be) deleted. Selection is per-site, oldest-first:
 *
 *  - `maxAgeDays`: any scan older than the cutoff is a candidate.
 *  - `maxScansPerSite`: the newest N are kept; every older scan is a candidate.
 *  - `keepCiBaselines`: a candidate that is referenced as a comparison baseline
 *    (`comparisons.list({ baseScanId })` non-empty) is removed from the deletion
 *    set and counted as a protected baseline.
 *
 * With no dimension set, nothing is deleted (unlimited retention).
 */
export async function pruneScans(
  storage: Storage,
  retention: Retention | undefined,
  opts: PruneOptions = {},
): Promise<PruneResult> {
  const dryRun = opts.dryRun ?? false
  const now = opts.now ?? Date.now()
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE

  const result: PruneResult = {
    dryRun,
    totalScansDeleted: 0,
    totalBlobsDeleted: 0,
    deletions: [],
    perSite: [],
  }

  // No rules configured → unlimited retention, nothing to do.
  if (!retention || (retention.maxScansPerSite == null && retention.maxAgeDays == null))
    return result

  const ageCutoff = retention.maxAgeDays != null ? now - retention.maxAgeDays * MS_PER_DAY : null

  const all = await listAllScans(storage, pageSize)

  // Group by site.
  const bySite = new Map<string, Scan[]>()
  for (const scan of all) {
    const bucket = bySite.get(scan.site)
    if (bucket)
      bucket.push(scan)
    else
      bySite.set(scan.site, [scan])
  }

  for (const [site, scansForSite] of bySite) {
    // Newest-first so index-based count keeping is trivial; delete oldest-first.
    const sorted = [...scansForSite].sort((a, b) => startedAtMs(b) - startedAtMs(a))

    const candidates: { scan: Scan, reasons: PruneReason[] }[] = []
    sorted.forEach((scan, index) => {
      const reasons: PruneReason[] = []
      if (retention.maxScansPerSite != null && index >= retention.maxScansPerSite)
        reasons.push('count')
      if (ageCutoff != null && startedAtMs(scan) < ageCutoff)
        reasons.push('age')
      if (reasons.length)
        candidates.push({ scan, reasons })
    })

    let protectedBaselines = 0
    // Filter out protected baselines when keepCiBaselines is set.
    const toDelete: { scan: Scan, reasons: PruneReason[] }[] = []
    for (const candidate of candidates) {
      if (retention.keepCiBaselines) {
        const refs = await storage.comparisons.list({ baseScanId: candidate.scan.scanId })
        if (refs.length > 0) {
          protectedBaselines += 1
          continue
        }
      }
      toDelete.push(candidate)
    }

    // Delete oldest-first.
    toDelete.sort((a, b) => startedAtMs(a.scan) - startedAtMs(b.scan))

    const siteResult: PruneSiteResult = {
      site,
      considered: scansForSite.length,
      deleted: 0,
      protectedBaselines,
      scanIds: [],
    }

    for (const { scan, reasons } of toDelete) {
      const blobKeys = await storage.blobs.list(`scans/${scan.scanId}/`)
      if (!dryRun) {
        for (const key of blobKeys)
          await storage.blobs.delete(key)
        await storage.scans.delete(scan.scanId)
      }
      const deletion: PruneScanDeletion = {
        scanId: scan.scanId,
        site,
        startedAt: scan.startedAt,
        reasons,
        blobKeys,
      }
      result.deletions.push(deletion)
      result.totalBlobsDeleted += blobKeys.length
      siteResult.deleted += 1
      siteResult.scanIds.push(scan.scanId)
    }

    result.totalScansDeleted += siteResult.deleted
    result.perSite.push(siteResult)
  }

  return result
}
