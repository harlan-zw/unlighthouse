import type { HookMap, Logger, ResolvedUserConfig, Storage } from '@unlighthouse/contracts'
import type { Hookable } from 'hookable'
import { scanCrux } from '@unlighthouse/contracts/drizzle'
import { fetchCruxHistory, getSiteOrigin } from '@unlighthouse/core/auditors'
import { processScanData } from '@unlighthouse/core/report'
import { and, eq } from 'drizzle-orm'

export interface HistorySubscriberDeps {
  resolvedConfig: ResolvedUserConfig
  storage: Storage
  hooks: Hookable<HookMap>
  logger?: Logger
}

/**
 * Post-scan history orchestration subscriber.
 *
 * Core (`createUnlighthouseCore`) handles the per-route writes: `storage.scans.*`,
 * `storage.routes.putBatch`, and LHR blob persistence. This subscriber adds the
 * dashboard-private aggregations on terminal events:
 *
 *  - on `scan:complete`: run `processScanData` (populates 17 detail tables +
 *    1 summary row from the LHR blobs), fetch CrUX phone/desktop snapshots.
 *  - cancelled/error: no-op (storage already set the row to cancelled/error
 *    in `createUnlighthouseCore`'s terminal handler).
 *
 * Idempotent under repeated registration: hosts construct one subscriber per
 * host instance; the host's hookable bus is per-host so no module-level guard
 * is needed.
 */
export function historySubscriber(deps: HistorySubscriberDeps): void {
  const { hooks, resolvedConfig, storage, logger } = deps

  hooks.hook('scan:complete', async ({ scanId }) => {
    logger?.debug?.(`Processing dashboard data for scan: ${scanId}`)

    const compareCfg = resolvedConfig.ci?.comparison
    await processScanData(storage as Storage & { db?: any }, scanId, {
      compare: compareCfg?.enabled !== false,
      thresholds: compareCfg?.thresholds,
    }).catch((err: unknown) => {
      logger?.error?.(`Failed to process scan data: ${err}`)
    })

    if (resolvedConfig.googleApiKey && resolvedConfig.site) {
      const origin = getSiteOrigin(resolvedConfig.site)
      const hostname = new URL(origin).host
      const db = (storage as { db?: any }).db
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
