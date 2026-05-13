/**
 * @unlighthouse/audit-pool — tinypool-backed Puppeteer worker pool tuned for Lighthouse audits.
 *
 * Driver entry. Tree-shakable named exports; this module does not import puppeteer.
 *
 *   import { createAuditPool, runTask, drain, destroy } from '@unlighthouse/audit-pool'
 *
 *   const pool = await createAuditPool({
 *     workerFile: new URL('./audit-worker.mjs', import.meta.url).pathname,
 *   })
 *
 *   pool.hooks.hook('task:error', (name, _, err) => log.warn(name, err))
 *   const result = await runTask(pool, 'lighthouse', { url, artifactPath })
 *   await drain(pool)
 *   await destroy(pool)
 *
 * Worker files import from `@unlighthouse/audit-pool/worker`.
 */
export { defineAuditPool, defineTask } from './define'
export { clearQueue, destroy, drain, getStats, resetStats, runTask } from './operations'
export { createAuditPool } from './pool'
export type {
  AuditPool,
  AuditPoolHooks,
  AuditPoolOptions,
  AuditPoolStats,
  Concurrency,
  ResolvedAuditPoolOptions,
} from './types'
