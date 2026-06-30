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

import type { CommandOutput, PackList, PackRunCmd } from '@unlighthouse/contracts/commands'
import type { PackRun } from '@unlighthouse/contracts/packs'
import type { Handler } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { builtInPacks, getPack } from '../../packs/index'
import { createPackReconcileCtx } from '../../packs/reconcile-context'

// Inline-vs-spill threshold for cached reports. SQLite handles big JSON
// columns fine, but the wire format and the row-cache both benefit from
// keeping the inline payload reasonable. Anything past this lands in blob
// storage and the row keeps only the key.
const INLINE_REPORT_LIMIT_BYTES = 64 * 1024

function packRunBlobKey(scanId: string, packName: string, packVersion: string): string {
  return `scans/${scanId}/packs/${packName}-${packVersion}.json`
}

// D-029: pack runs are device-scoped. The packRuns table is still keyed on
// (scanId, packName, packVersion) — extending the PK was out of scope for
// this PR — so we encode device into packName when the caller asked for a
// specific device. Single-device callers (no input.device) keep the bare
// pack name and hit the existing cache row exactly as before.
function packKeyFor(packName: string, device?: string): string {
  return device ? `${packName}@${device}` : packName
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

    const cachePackName = packKeyFor(pack.name, input.device)

    // Cache lookup — keyed on (scanId, packName(+device), packVersion). When
    // the row points at a blob (large report), inflate it before returning.
    if (!input.refresh) {
      const cached = await ctx.storage.packRuns.get(input.scanId, cachePackName, pack.version)
      if (cached) {
        const report = await loadCachedReport(cached, ctx)
        if (report !== null) {
          return {
            scanId: cached.scanId,
            // Strip the device suffix from the wire — clients see the bare
            // pack name they asked for, the cache key is internal.
            packName: pack.name,
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
    // D-029: when the caller specified a device, narrow the row set so the
    // pack only sees rows for that form-factor. Omitted = full matrix.
    const routes = await ctx.storage.routes.listForScan(input.scanId, {
      page: 1,
      pageSize: 10_000,
      device: input.device,
    })

    const report = await pack.reconciler(createPackReconcileCtx({
      scanId: input.scanId,
      routes: routes.items,
      blobs: ctx.storage.blobs,
    }))

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
    // (scanId, cachePackName, packVersion), so spill→spill overwrites in place;
    // only spill→inline can leave an orphan, handled below.
    const serialised = JSON.stringify(parsed.data)
    const spill = serialised.length > INLINE_REPORT_LIMIT_BYTES
    let reportBlobKey: string | null = null
    if (spill) {
      reportBlobKey = packRunBlobKey(input.scanId, cachePackName, pack.version)
      await ctx.storage.blobs.put(reportBlobKey, new TextEncoder().encode(serialised), { contentType: 'application/json' })
    }

    // Look up the previous row (if any) so we can clean up its blob if the
    // new run drops below the spill threshold. Cheap second read — the cache
    // path already missed, so there's at most one row here.
    const prior = await ctx.storage.packRuns.get(input.scanId, cachePackName, pack.version)

    await ctx.storage.packRuns.put({
      scanId: input.scanId,
      packName: cachePackName,
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
      ctx.storage.blobs.delete(prior.reportBlobKey).catch((err) => {
        logOperationalWarn('storage.old_blob_delete_failed', err, {
          scanId: input.scanId,
          packName: cachePackName,
          blobKey: prior.reportBlobKey,
        })
      })
    }

    return {
      // Wire `packName` is the bare pack id the caller asked for; cache key
      // mangling (cachePackName) stays internal.
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
