/**
 * Local Lighthouse auditor — driver side. Spawns a core-owned audit pool whose worker
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
import type { AuditPool } from './audit-pool'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuditPool, runTask } from './audit-pool'
import { LIGHTHOUSE_DEFAULT_CATEGORIES } from './categories'
import { attachExtractedRouteData } from './lighthouse-report'

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
  categories: [...LIGHTHOUSE_DEFAULT_CATEGORIES],
}

const WORKER_FILE = (() => {
  const candidates = [
    // Unbundled layout: dist/auditors/local.mjs -> dist/auditors/local-worker.mjs.
    fileURLToPath(new URL('./local-worker.mjs', import.meta.url)),
    // Chunked layout: shared local chunk emitted at dist/*.mjs.
    fileURLToPath(new URL('./auditors/local-worker.mjs', import.meta.url)),
    // Stub/source layout: src/auditors/local.ts -> dist/auditors/local-worker.mjs.
    join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'dist', 'auditors', 'local-worker.mjs'),
  ] as const
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0]
})()

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
      // Map the per-route device onto Lighthouse's emulatedFormFactor. Without
      // this every audit (mobile AND desktop) silently ran with the default
      // mobile emulation, so desktop scores/screenshots were really mobile.
      const lighthouseFlags = {
        ...(opts.defaults?.lighthouseFlags ?? {}),
        ...(_opts?.lighthouseFlags ?? {}),
      }
      const options = {
        ...opts.defaults,
        ...(Object.keys(lighthouseFlags).length ? { lighthouseFlags } : {}),
        ...(_opts?.lighthouseConfig ? { lighthouseConfig: _opts.lighthouseConfig } : {}),
        ...(_opts?.device ? { emulatedFormFactor: _opts.device } : {}),
      }
      const report = await runTask<UnlighthouseReport>(pool, 'lighthouse', { url, options })
      return attachExtractedRouteData(report.raw, url, 'local')
    },
  }
}
