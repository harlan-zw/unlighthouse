import type { Logger, ResolvedUserConfig, Storage } from '@unlighthouse/contracts'
import type { HookMap } from '@unlighthouse/contracts/hooks'
import type { Hookable } from 'hookable'
import { parseScanId } from '@unlighthouse/contracts'
import { scanCrux } from '@unlighthouse/contracts/drizzle'
import { pruneScans } from '@unlighthouse/core'
import { fetchCruxHistory, getSiteOrigin } from '@unlighthouse/core/auditors/crux'
import { asDrizzleDatabase } from '@unlighthouse/core/storage/drizzle'
import { and, eq } from 'drizzle-orm'

export interface HistorySubscriberDeps {
  resolvedConfig: ResolvedUserConfig
  storage: Storage
  hooks: Hookable<HookMap>
  logger?: Logger
}

async function writeScanManifest(storage: Storage, scanId: string): Promise<void> {
  const parsedScanId = parseScanId(scanId)
  const scan = await storage.scans.get(parsedScanId)
  const list = await storage.routes.listForScan(parsedScanId, { pageSize: 10_000 })
  const manifest = {
    scanId,
    site: scan?.site ?? null,
    device: scan?.device ?? null,
    status: scan?.status ?? null,
    startedAt: scan?.startedAt ?? null,
    completedAt: scan?.completedAt ?? null,
    summary: scan?.summary ?? null,
    routes: list.items.map(r => ({
      path: r.path,
      url: r.url,
      score: r.scorePerformance,
      lhrBlobKey: r.lhrBlobKey,
      reportBlobKey: (r as { reportBlobKey?: string | null }).reportBlobKey ?? null,
    })),
  }
  const key = `scans/${scanId}/manifest.json`
  const bytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
  await storage.blobs.put(key, bytes)
}

/**
 * Post-scan history subscriber — CLI-host-only enrichment.
 *
 * Scan finalization proper (aggregating `scan.summary` from the persisted
 * routes and writing the pack auto-runs) is core-owned: `finalizeScan`
 * (`@unlighthouse/core` `scan/route-audit.ts`) runs it before it emits
 * `scan:complete`, so every host — CLI, Cloudflare `ScanRunnerDO`, custom —
 * gets identical summary + pack rows (D-035). This subscriber only adds the
 * two enrichments that are genuinely CLI/Node-bound and that no host but the
 * local dashboard needs:
 *
 *  - a per-scan `manifest.json` blob (LHCI-compatible directory descriptor);
 *  - CrUX phone/desktop field-data snapshots (needs a raw drizzle handle;
 *    memory / D1 hosts skip persistence).
 *
 * cancelled/error are no-ops (core's terminal handler already set the row).
 *
 * Idempotent under repeated registration: hosts construct one subscriber per
 * host instance; the host's hookable bus is per-host so no module-level guard
 * is needed.
 */
export function historySubscriber(deps: HistorySubscriberDeps): void {
  const { hooks, resolvedConfig, storage, logger } = deps

  hooks.hook('scan:complete', async ({ scanId }) => {
    logger?.debug?.(`Writing history enrichment for scan: ${scanId}`)

    // Per-scan manifest.json — LHCI-compatible directory descriptor. Lists
    // every route + the scan summary so external tooling can ingest a folder
    // of scans without touching the SQLite database.
    await writeScanManifest(storage, scanId).catch((err: unknown) => {
      logger?.warn?.(`Failed to write manifest: ${err}`)
    })

    // D-044: auto-prune scan history when a retention policy is configured.
    // Non-fatal — retention is best-effort housekeeping, never a reason to fail
    // a completed scan. `pruneScans` is pure over the Storage port, so the CLI
    // host gets the same behaviour agents reach via `history.prune`.
    const retention = resolvedConfig.retention
    if (retention && (retention.maxScansPerSite != null || retention.maxAgeDays != null)) {
      await pruneScans(storage, retention)
        .then((res) => {
          if (res.totalScansDeleted > 0)
            logger?.info?.(`Retention: pruned ${res.totalScansDeleted} scan(s), ${res.totalBlobsDeleted} blob(s)`)
        })
        .catch((err: unknown) => {
          logger?.warn?.(`Retention prune failed: ${err}`)
        })
    }

    if (resolvedConfig.googleApiKey && resolvedConfig.site) {
      const origin = getSiteOrigin(resolvedConfig.site)
      const hostname = new URL(origin).host
      const db = storage.db ? asDrizzleDatabase(storage.db) : null
      for (const formFactor of ['PHONE', 'DESKTOP'] as const) {
        fetchCruxHistory({ apiKey: resolvedConfig.googleApiKey, origin, formFactor })
          .then(async (series) => {
            if (!series.lcp.length && !series.inp.length && !series.cls.length)
              return
            if (!db)
              return // memory / D1 — no CrUX persistence in v1.0.
            await db.delete(scanCrux)
              .where(and(eq(scanCrux.scanId, scanId), eq(scanCrux.formFactor, formFactor)))
            await db.insert(scanCrux).values({
              scanId,
              hostname,
              formFactor,
              seriesJson: JSON.stringify(series),
              fetchedAt: new Date(),
            })
          })
          .catch((err: { message: string }) => {
            logger?.warn?.(`CrUX fetch failed (${formFactor}): ${err.message}`)
          })
      }
    }
  })
}
