import type { AuditPool } from '@unlighthouse/audit-pool'
/**
 * Local Lighthouse auditor — driver side. Spawns an @unlighthouse/audit-pool whose worker
 * file is `./local-worker.mjs` (built from `local-worker.ts`).
 *
 * Each audit is dispatched as a `lighthouse` task to a worker thread. Worker-thread isolation
 * gives each in-flight audit its own lighthouse module instance, avoiding the process-global
 * `performance.mark` collisions that break in-process parallel `lighthouse()` calls.
 *
 * The pool is lazy: created on first `audit()` call, kept alive for the auditor's lifetime.
 * Pool of size 1 still serializes audits correctly (the original failure mode); raising
 * `maxThreads` gives real parallelism.
 */
import type { Logger, UnlighthouseOptions, UnlighthouseReport } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, LighthouseReport, Page } from '@unlighthouse/contracts/ports'
import { fileURLToPath } from 'node:url'
import { createAuditPool, runTask } from '@unlighthouse/audit-pool'
import { extractRouteData } from '../report/extract'

export interface LocalAuditorOptions {
  /** Default UnlighthouseOptions applied to every audit call. */
  defaults?: UnlighthouseOptions
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
  /** Max concurrent audits. Default: `max(1, floor(cores/2))` (lighthouse-tuned). */
  maxThreads?: number
}

const LOCAL_CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: true,
  reliableFieldData: false,
  supportsThrottling: true,
  categories: ['performance', 'accessibility', 'seo', 'best-practices'],
}

const WORKER_FILE = fileURLToPath(new URL('./local-worker.mjs', import.meta.url))

export function createLocalAuditor(opts: LocalAuditorOptions = {}): Auditor {
  let poolPromise: Promise<AuditPool> | undefined

  function getPool(): Promise<AuditPool> {
    if (!poolPromise) {
      poolPromise = createAuditPool({
        workerFile: WORKER_FILE,
        bare: true,
        maxThreads: opts.maxThreads,
        // The worker file launches Chrome itself; the pool's puppeteer launch is skipped.
        // Lighthouse audits already run for ~10-60s each, so retries are off — failures bubble
        // up to the crawler which decides retry policy.
        retries: 0,
        recycleAfter: 0,
      })
    }
    return poolPromise
  }

  return {
    capabilities: LOCAL_CAPABILITIES,
    async audit(url: string, _page?: Page, _opts?: AuditOpts): Promise<LighthouseReport> {
      const pool = await getPool()
      const report = await runTask<UnlighthouseReport>(pool, 'lighthouse', { url, options: opts.defaults })
      const lhr = report.raw
      const extracted = extractRouteData(lhr as never)
      const path = (() => {
        try { return new URL(url).pathname }
        catch { return url }
      })()
      const metrics = {
        url,
        path,
        routeName: null,
        scorePerformance: extracted.scores.performance,
        scoreAccessibility: extracted.scores.accessibility,
        scoreSeo: extracted.scores.seo,
        scoreBestPractices: extracted.scores.bestPractices,
        lcp: extracted.lcp,
        cls: extracted.cls,
        inp: extracted.inp,
        fcp: extracted.fcp,
        ttfb: extracted.ttfb,
        tbt: extracted.tbt,
        si: extracted.si,
        lighthouseVersion: (lhr as { lighthouseVersion?: string }).lighthouseVersion ?? 'unknown',
        capturedAt: new Date().toISOString(),
      }
      return Object.assign(
        lhr as unknown as LighthouseReport,
        { extracted: metrics, lhrGzip: extracted.lhrGzip },
      )
    },
  }
}
