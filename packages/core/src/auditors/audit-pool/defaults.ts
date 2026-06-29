import type { AuditPoolOptions, ResolvedAuditPoolOptions } from './types'
import { availableParallelism } from 'node:os'

export function resolveOptions(options: AuditPoolOptions): ResolvedAuditPoolOptions {
  const cores = availableParallelism()
  return {
    workerFile: options.workerFile,
    minThreads: options.minThreads ?? 1,
    maxThreads: options.maxThreads ?? Math.max(1, Math.floor(cores / 2)),
    idleTimeout: options.idleTimeout ?? 30_000,
    taskTimeout: options.taskTimeout ?? 90_000,
    retries: options.retries ?? 1,
    recycleAfter: options.recycleAfter ?? 10,
    concurrency: options.concurrency ?? 'browser',
    bare: options.bare ?? false,
    puppeteerOptions: options.puppeteerOptions ?? {},
    workerData: options.workerData ?? {},
  }
}
