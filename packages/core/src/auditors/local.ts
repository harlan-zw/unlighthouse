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
import { createAuditPool, createSerialLane, resolveMaxThreads, runTask } from './audit-pool'
import { LIGHTHOUSE_DEFAULT_CATEGORIES } from './categories'
import { attachExtractedRouteData } from './lighthouse-report'

export interface LocalAuditorOptions {
  /** Default UnlighthouseOptions applied to every audit call. */
  defaults?: UnlighthouseOptions
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
  /** Max concurrent audits. Default: `max(1, floor(cores/2))` (lighthouse-tuned). */
  maxThreads?: number
  /**
   * D-042: how perf-category audits share the pool when `maxThreads > 1`.
   * - `serial` (default): perf-including audits run through a serial lane — one
   *   at a time — so CPU contention never contaminates TBT/LCP/SI. Non-perf
   *   audits (a11y/seo/best-practices only, e.g. via the split auditor) still
   *   dispatch straight to the pool and run in parallel.
   * - `parallel`: keep perf audits parallel; capabilities then report
   *   `reliablePerfScores: false`. It is impossible to have both parallel perf
   *   AND reliable perf scores.
   */
  perfConcurrency?: 'serial' | 'parallel'
  /**
   * @internal
   * worker-thread pool. Injected in tests to exercise the serial perf lane and
   * concurrency stamping without launching Chrome.
   */
  runLighthouseTask?: (payload: { url: string, options: unknown }) => Promise<UnlighthouseReport>
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

/** Read `onlyCategories` off a lighthouse-flags bag as a string list, if present. */
function readOnlyCategories(flags: Record<string, unknown> | undefined): string[] | undefined {
  const oc = flags?.onlyCategories
  return Array.isArray(oc) ? oc.map(String) : undefined
}

/**
 * Does this audit measure the `performance` category? An absent/empty
 * `onlyCategories` means Lighthouse runs every category, which includes
 * performance — so those audits are treated as perf-including too.
 */
function includesPerformanceCategory(onlyCategories: string[] | undefined): boolean {
  if (!onlyCategories || onlyCategories.length === 0)
    return true
  return onlyCategories.includes('performance')
}

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

  // Size capabilities + provenance against the same thread count the pool uses.
  const maxThreads = resolveMaxThreads(opts.maxThreads)
  const parallelPerf = opts.perfConcurrency === 'parallel'
  // D-042 capability honesty: perf scores are trustworthy only when perf audits
  // are NOT contending for CPU. That holds when the pool is single-lane
  // (maxThreads <= 1) OR perf audits run through the serial lane (serial mode,
  // the default). The ONLY way to lose it is explicit parallel perf on a
  // multi-worker pool — so parallel perf and `reliablePerfScores: true` can
  // never co-occur.
  const reliablePerfScores = !(parallelPerf && maxThreads > 1)
  const capabilities: AuditorCapabilities = { ...LOCAL_CAPABILITIES, reliablePerfScores }

  // The serial perf lane. Only ever entered when serializing perf audits.
  const perfLane = createSerialLane()

  const runLighthouse = opts.runLighthouseTask
    ?? (async (payload: { url: string, options: unknown }): Promise<UnlighthouseReport> => {
      const pool = await getPool()
      return runTask<UnlighthouseReport>(pool, 'lighthouse', payload)
    })

  return {
    capabilities,
    async audit(url: string, _page?: Page, _opts?: AuditOpts): Promise<LighthouseReport> {
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

      // D-042 serial perf lane: when the pool is multi-worker and we are NOT in
      // explicit parallel-perf mode, gate perf-including audits through the lane
      // so at most one runs at a time. Non-perf audits dispatch straight to the
      // pool and stay parallel. `effectiveConcurrency` is stamped into the
      // report so provenance records the conditions the perf score ran under.
      const perfIncluded = includesPerformanceCategory(readOnlyCategories(lighthouseFlags))
      const serialize = perfIncluded && !parallelPerf && maxThreads > 1
      const effectiveConcurrency = serialize ? 1 : maxThreads

      const dispatch = () => runLighthouse({ url, options })
      const report = serialize ? await perfLane.run(dispatch) : await dispatch()

      const out = attachExtractedRouteData(report.raw, url, 'local')
      ;(out as { concurrency?: number }).concurrency = effectiveConcurrency
      return out
    },
  }
}
