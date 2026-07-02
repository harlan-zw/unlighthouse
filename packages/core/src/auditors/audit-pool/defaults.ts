import type { AuditPoolOptions, ResolvedAuditPoolOptions } from './types'
import { availableParallelism } from 'node:os'

/**
 * Effective max worker threads. `max(1, floor(cores / 2))` when unset —
 * lighthouse perf scores degrade when audits compete for CPU, so half the
 * cores leaves headroom for the audited page (which spawns its own Chrome).
 * Exported so the local auditor can size its capabilities + provenance stamp
 * against the same number the pool will use.
 */
export function resolveMaxThreads(maxThreads?: number): number {
  return maxThreads ?? Math.max(1, Math.floor(availableParallelism() / 2))
}

export function resolveOptions(options: AuditPoolOptions): ResolvedAuditPoolOptions {
  return {
    workerFile: options.workerFile,
    minThreads: options.minThreads ?? 1,
    maxThreads: resolveMaxThreads(options.maxThreads),
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
