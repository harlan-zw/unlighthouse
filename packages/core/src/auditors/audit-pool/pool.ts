import type { AuditPool, AuditPoolHooks, AuditPoolOptions } from './types'
import { createHooks } from 'hookable'
import Tinypool from 'tinypool'
import { resolveOptions } from './defaults'

export async function createAuditPool(options: AuditPoolOptions): Promise<AuditPool> {
  const resolved = resolveOptions(options)
  const hooks = createHooks<AuditPoolHooks>()

  const pool = new Tinypool({
    filename: resolved.workerFile,
    minThreads: resolved.minThreads,
    maxThreads: resolved.maxThreads,
    idleTimeout: resolved.idleTimeout,
    workerData: {
      concurrency: resolved.concurrency,
      bare: resolved.bare,
      puppeteerOptions: resolved.puppeteerOptions,
      recycleAfter: resolved.recycleAfter,
      taskTimeout: resolved.taskTimeout,
      userWorkerData: resolved.workerData,
    },
  })

  return {
    hooks,
    options: resolved,
    _internal: {
      pool,
      stats: {
        enqueued: 0,
        completed: 0,
        errored: 0,
        active: 0,
        queued: 0,
        workers: 0,
        startedAt: Date.now(),
      },
      pending: new Set(),
      destroyed: false,
    },
  }
}
