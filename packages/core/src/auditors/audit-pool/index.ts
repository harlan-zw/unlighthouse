/**
 * Core-local audit pool — tinypool-backed Puppeteer worker pool tuned for Lighthouse audits.
 *
 * Driver entry. Tree-shakable named exports; this module does not import puppeteer.
 *
 *   import { createAuditPool, runTask, drain, destroy } from './audit-pool'
 *
 *   const pool = await createAuditPool({
 *     workerFile: new URL('./audit-worker.mjs', import.meta.url).pathname,
 *   })
 *
 *   pool.hooks.hook('task:error', (name, _, err) => logOperationalWarn('auditor.cleanup_failed', err, { name }))
 *   const result = await runTask(pool, 'lighthouse', { url, artifactPath })
 *   await drain(pool)
 *   await destroy(pool)
 *
 * Worker files import from `./audit-pool/worker`.
 */
export { resolveMaxThreads } from './defaults'
export { defineTask } from './define'
export { clearQueue, destroy, drain, getStats, resetStats, runTask } from './operations'
export { createAuditPool } from './pool'
export { createSerialLane } from './serial-lane'
export type { SerialLane } from './serial-lane'
export type {
  AuditPool,
  AuditPoolHooks,
  AuditPoolOptions,
  AuditPoolStats,
  Concurrency,
  ResolvedAuditPoolOptions,
} from './types'
