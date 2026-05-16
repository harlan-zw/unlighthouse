// pack.* handlers — D-028.
//
// `pack.run` resolves a pack by name from the host's registry (built-in plus
// any third-party packs the host has wired up), pulls the scan's routes from
// storage, and hands them to the pack's reconciler. Output is validated
// against the pack's own reportSchema before going over the wire — packs
// can't lie about their report shape.
//
// Results are cached in `storage.packRuns` keyed on (scanId, packName,
// packVersion). Scans are immutable so the report is too; bumping the pack
// version is what invalidates a stale entry. Callers can force a re-run with
// `refresh: true`.

import type { CommandOutput, Device, PackList, PackRun, PackRunCmd } from '@unlighthouse/contracts'
import type { Handler } from './types'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { UnlighthouseError } from '@unlighthouse/contracts'
import { builtInPacks, getPack } from '../../packs/index'

// Inline-vs-spill threshold for cached reports. SQLite handles big JSON
// columns fine, but the wire format and the row-cache both benefit from
// keeping the inline payload reasonable. Anything past this lands in blob
// storage and the row keeps only the key.
const INLINE_REPORT_LIMIT_BYTES = 64 * 1024

function packRunBlobKey(scanId: string, packName: string, packVersion: string): string {
  return `scans/${scanId}/packs/${packName}-${packVersion}.json`
}

export const packRun: Handler<typeof PackRunCmd> = {
  command: {} as typeof PackRunCmd,
  async run(input, ctx) {
    const pack = getPack(input.pack)
    if (!pack) {
      throw new UnlighthouseError({
        code: 'PACK_NOT_FOUND',
        message: `Pack \`${input.pack}\` is not registered on this host. Run \`pack.list\` for available packs.`,
      })
    }

    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan) {
      throw new UnlighthouseError({
        code: 'SCAN_NOT_FOUND',
        message: `No scan found for scanId=${input.scanId}`,
      })
    }

    // Cache lookup — keyed on (scanId, packName, packVersion). When the row
    // points at a blob (large report), inflate it before returning.
    if (!input.refresh) {
      const cached = await ctx.storage.packRuns.get(input.scanId, pack.name, pack.version)
      if (cached) {
        const report = await loadCachedReport(cached, ctx)
        if (report !== null) {
          return {
            scanId: cached.scanId,
            packName: cached.packName,
            packVersion: cached.packVersion,
            startedAt: cached.startedAt,
            completedAt: cached.completedAt,
            report,
            cache: 'hit',
          } as CommandOutput<typeof PackRunCmd>
        }
        // Blob missing for a row that claims one — fall through and rebuild
        // rather than serving a half-row. Stale storage shouldn't 500 us.
      }
    }

    const startedAt = new Date().toISOString()

    // Pull all routes for the scan. Pack reconcilers iterate rows in memory;
    // a 1k-route scan at ~200B/row is well under any reasonable cap. If a
    // future pack needs streaming, the storage port already supports it via
    // cursors — bridge it then.
    const routes = await ctx.storage.routes.listForScan(input.scanId, { page: 1, pageSize: 10_000 })

    // Lazy LHR fetcher. Each blob is ~50-200KB gzipped; packs that need raw
    // audit details (images, cwv) call this per URL, packs that only need
    // ExtractedMetrics rows (overview) ignore it. Cached per pack run since
    // multiple reconcilers within one pack may want the same route.
    const lhrCache = new Map<string, unknown>()
    const getLhr = async (url: string, _device: Device): Promise<unknown> => {
      // Device fan-out is D-029 — until ScanRoute carries a device column,
      // the key is just URL. When devices land, key on `${url}|${device}`.
      if (lhrCache.has(url))
        return lhrCache.get(url)
      const row = routes.items.find(r => r.url === url)
      if (!row?.lhrBlobKey)
        return null
      const gz = await ctx.storage.blobs.get(row.lhrBlobKey)
      if (!gz)
        return null
      const lhr = JSON.parse(gunzipSync(gz).toString())
      lhrCache.set(url, lhr)
      return lhr
    }

    // D-030 reconciled report fetcher. Mirrors getLhr but pulls the
    // contract-shape blob written at ingest. Packs that opt in survive
    // Lighthouse version drift without re-parsing the raw LHR — the
    // reconciler produced a stable AuditFinding shape they can read against.
    // Returns `null` when the reconciled blob is missing (older scans, or
    // ingest-time reconciliation failed) so packs can fall through to getLhr.
    const reconciledCache = new Map<string, unknown>()
    const getReconciled = async (url: string, _device: Device): Promise<unknown> => {
      if (reconciledCache.has(url))
        return reconciledCache.get(url)
      const row = routes.items.find(r => r.url === url)
      if (!row?.lhrBlobKey)
        return null
      // Derive the contract-blob key from the same scan / url hash that
      // produced the LHR key. Mirrors the path written in core.ts ingest.
      const hash = createHash('sha1').update(url).digest('hex').slice(0, 16)
      const contractKey = `scans/${input.scanId}/reports/${hash}.contract.json`
      const buf = await ctx.storage.blobs.get(contractKey)
      if (!buf)
        return null
      const parsed = JSON.parse(new TextDecoder().decode(buf))
      reconciledCache.set(url, parsed)
      return parsed
    }

    const report = await pack.reconciler({
      scanId: input.scanId,
      routes: routes.items,
      getLhr,
      getReconciled,
      logger: undefined,
    })

    // Validate before serialisation. A pack misreporting its own schema is
    // a bug in the pack, not a runtime contract; surface it loudly.
    const parsed = pack.reportSchema.safeParse(report)
    if (!parsed.success) {
      throw new UnlighthouseError({
        code: 'PACK_REPORT_INVALID',
        message: `Pack \`${pack.name}\` produced a report that doesn't match its own reportSchema.`,
        cause: parsed.error,
      })
    }

    const completedAt = new Date().toISOString()

    // Persist. Small reports inline, large ones spill to the blob store —
    // the row keeps only the blob key. Blob key is deterministic on
    // (scanId, packName, packVersion), so spill→spill overwrites in place;
    // only spill→inline can leave an orphan, handled below.
    const serialised = JSON.stringify(parsed.data)
    const spill = serialised.length > INLINE_REPORT_LIMIT_BYTES
    let reportBlobKey: string | null = null
    if (spill) {
      reportBlobKey = packRunBlobKey(input.scanId, pack.name, pack.version)
      await ctx.storage.blobs.put(reportBlobKey, new TextEncoder().encode(serialised), { contentType: 'application/json' })
    }

    // Look up the previous row (if any) so we can clean up its blob if the
    // new run drops below the spill threshold. Cheap second read — the cache
    // path already missed, so there's at most one row here.
    const prior = await ctx.storage.packRuns.get(input.scanId, pack.name, pack.version)

    await ctx.storage.packRuns.put({
      scanId: input.scanId,
      packName: pack.name,
      packVersion: pack.version,
      startedAt,
      completedAt,
      report: spill ? null : parsed.data,
      reportBlobKey,
    })

    if (prior?.reportBlobKey && prior.reportBlobKey !== reportBlobKey) {
      // Old spill blob is orphaned (new run is inline, or — defensively — went
      // to a different key). Fire and don't surface failures: a stale blob is
      // wasted bytes, not corruption.
      ctx.storage.blobs.delete(prior.reportBlobKey).catch(() => {})
    }

    return {
      scanId: input.scanId,
      packName: pack.name,
      packVersion: pack.version,
      startedAt,
      completedAt,
      report: parsed.data,
      cache: 'miss',
    } as CommandOutput<typeof PackRunCmd>
  },
}

// Internal: rehydrate a cached row. Returns `null` when the row claims a
// blob that no longer exists (caller treats this as a cache miss).
async function loadCachedReport(
  cached: PackRun,
  ctx: Parameters<typeof packRun.run>[1],
): Promise<unknown | null> {
  if (cached.report != null)
    return cached.report
  if (!cached.reportBlobKey)
    return null
  const buf = await ctx.storage.blobs.get(cached.reportBlobKey)
  if (!buf)
    return null
  return JSON.parse(new TextDecoder().decode(buf))
}

export const packList: Handler<typeof PackList> = {
  command: {} as typeof PackList,
  async run(_input, _ctx) {
    const packs = Object.values(builtInPacks).map(p => ({
      name: p.name,
      description: p.description,
      version: p.version,
      auditorCount: p.auditors?.length ?? 0,
    }))
    return { packs } as CommandOutput<typeof PackList>
  },
}
