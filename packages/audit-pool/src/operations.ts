import type Tinypool from 'tinypool'
import type { AuditPool, AuditPoolStats } from './types'
import { consola } from 'consola'

const logger = consola.withTag('audit-pool')

interface PoolHandle {
  pool: Tinypool
  destroyed: boolean
}

function ensureAlive(pool: AuditPool): asserts pool is AuditPool {
  if (pool._internal.destroyed)
    throw new Error('[@unlighthouse/audit-pool] pool has been destroyed')
}

function tp(pool: AuditPool): Tinypool {
  return (pool._internal as unknown as PoolHandle).pool
}

/**
 * Enqueue a named task. Resolves with the worker's return value (structured-cloned).
 *
 * Errors are propagated after the configured retries are exhausted; intermediate retry
 * failures fire `task:error` hooks with `willRetry: true`.
 */
export async function runTask<TResult = unknown, TPayload = unknown>(
  pool: AuditPool,
  taskName: string,
  payload: TPayload,
): Promise<TResult> {
  ensureAlive(pool)
  const { stats, pending } = pool._internal
  stats.enqueued++
  stats.queued++
  await pool.hooks.callHook('task:enqueued', taskName, payload)

  const attempts = pool.options.retries + 1
  const exec = async (): Promise<TResult> => {
    stats.queued--
    stats.active++
    await pool.hooks.callHook('task:start', taskName, payload)
    try {
      const result = await tp(pool).run({ taskName, payload }) as TResult
      stats.completed++
      await pool.hooks.callHook('task:success', taskName, payload, result)
      return result
    }
    finally {
      stats.active--
    }
  }

  const promise = (async () => {
    let lastErr: Error | undefined
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await exec()
      }
      catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        const willRetry = attempt < attempts - 1
        await pool.hooks.callHook('task:error', taskName, payload, lastErr, willRetry)
        if (!willRetry) {
          stats.errored++
          throw lastErr
        }
        stats.queued++
      }
    }
    throw lastErr ?? new Error('[@unlighthouse/audit-pool] runTask exhausted without result')
  })()

  pending.add(promise)
  promise.finally(() => {
    pending.delete(promise)
    if (pending.size === 0)
      void pool.hooks.callHook('queue:drained')
  })
  return promise
}

export function getStats(pool: AuditPool): AuditPoolStats {
  const p = tp(pool)
  return {
    ...pool._internal.stats,
    workers: p.threads.length,
    queued: p.queueSize,
  }
}

export function resetStats(pool: AuditPool): void {
  const s = pool._internal.stats
  s.enqueued = 0
  s.completed = 0
  s.errored = 0
  s.active = 0
  s.queued = 0
  s.startedAt = Date.now()
}

/** Drop queued (not-yet-started) tasks. In-flight tasks finish. */
export function clearQueue(pool: AuditPool): void {
  ensureAlive(pool)
  const p = tp(pool) as Tinypool & { cancelPendingTasks?: () => void }
  p.cancelPendingTasks?.()
  pool._internal.stats.queued = 0
}

/** Resolves when queue empty and all in-flight tasks settle. */
export async function drain(pool: AuditPool): Promise<void> {
  while (pool._internal.pending.size > 0)
    await Promise.allSettled([...pool._internal.pending])
}

export async function destroy(pool: AuditPool): Promise<void> {
  if (pool._internal.destroyed)
    return
  pool._internal.destroyed = true
  await drain(pool).catch(err => logger.warn('drain failed during destroy', err))
  await tp(pool).destroy()
}
