import type Tinypool from 'tinypool'
import type { AuditPool, AuditPoolHooks } from '../src/auditors/audit-pool/types'
import { createHooks } from 'hookable'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { runTask } from '../src/auditors/audit-pool/operations'

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => unhandled.push(reason)

process.on('unhandledRejection', onUnhandled)

afterEach(() => {
  unhandled.length = 0
})

afterAll(() => {
  process.off('unhandledRejection', onUnhandled)
})

function rejectingPool(error: Error): AuditPool {
  const runner = {
    queueSize: 0,
    run: vi.fn().mockRejectedValue(error),
    threads: [],
  } as unknown as Tinypool

  return {
    hooks: createHooks<AuditPoolHooks>(),
    options: {
      workerFile: 'test-worker.mjs',
      minThreads: 1,
      maxThreads: 1,
      idleTimeout: 30_000,
      taskTimeout: 90_000,
      retries: 0,
      recycleAfter: 0,
      concurrency: 'browser',
      bare: true,
      puppeteerOptions: {},
      workerData: {},
    },
    _internal: {
      pool: runner,
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

describe('audit-pool task rejection cleanup', () => {
  it('does not fork a handled task failure into an unhandled rejection', async () => {
    const failure = new Error('connection closed')
    const pool = rejectingPool(failure)

    await expect(runTask(pool, 'lighthouse', {})).rejects.toBe(failure)
    await new Promise(resolve => setImmediate(resolve))

    expect(pool._internal.pending.size).toBe(0)
    expect(unhandled).toEqual([])
  })
})
