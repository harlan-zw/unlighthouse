import type { AuditPoolOptions } from '../../src/audit/pool.ts'
import type { AuditJob, AuditPool, AuditResult } from '../../src/contracts.ts'
import { UnlighthouseError } from '../../src/errors.ts'

export interface FakePoolOptions {
  delayMs?: number
  performance?: (job: AuditJob) => number
  fail?: (job: AuditJob) => UnlighthouseError | null
}

export interface FakePool {
  createPool: (options: AuditPoolOptions) => AuditPool
  jobs: AuditJob[]
  aborted: AuditJob[]
  pools: AuditPoolOptions[]
  closed: number
  maxActive: number
}

export function fakeResult(job: AuditJob, performance: number): AuditResult {
  return {
    finalUrl: job.url,
    statusCode: 200,
    scores: { 'performance': performance, 'accessibility': 0.9, 'best-practices': 1, 'seo': 0.8, 'agentic-browsing': 0.5 },
    metrics: { fcp: 900, lcp: 1800, tbt: 50, cls: 0.01, si: 1200, ttfb: 200 },
    provenance: {
      lighthouseVersion: '13.5.0',
      benchmarkIndex: 2000,
      throttling: job.throttling,
      concurrency: job.concurrency,
      samples: job.samples,
      spread: null,
      warnings: [],
    },
    findings: [{
      auditId: 'image-delivery-insight',
      category: 'performance',
      title: 'Improve image delivery',
      severity: 'fail',
      score: 0,
      displayValue: 'Est savings of 100 KiB',
      itemKey: '/hero.png',
      itemLabel: 'hero.png',
      savingsMs: 300,
      savingsBytes: 100_000,
    }],
    report: Bun.gzipSync(JSON.stringify({ fake: true, url: job.url })),
    thumbnail: null,
    durationMs: 5,
  }
}

export function createFakePool(options: FakePoolOptions = {}): FakePool {
  let active = 0
  const fake: FakePool = {
    jobs: [],
    aborted: [],
    pools: [],
    closed: 0,
    maxActive: 0,
    createPool(poolOptions) {
      fake.pools.push(poolOptions)
      return {
        size: poolOptions.concurrency,
        run(job, signal) {
          fake.jobs.push(job)
          active++
          fake.maxActive = Math.max(fake.maxActive, active)
          return new Promise<AuditResult>((resolve, reject) => {
            const onAbort = () => {
              clearTimeout(timer)
              active--
              fake.aborted.push(job)
              reject(signal?.reason ?? new Error('aborted'))
            }
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', onAbort)
              active--
              const error = options.fail?.(job) ?? null
              if (error)
                reject(error)
              else
                resolve(fakeResult(job, options.performance?.(job) ?? 0.75))
            }, options.delayMs ?? 5)
            if (signal?.aborted)
              onAbort()
            else
              signal?.addEventListener('abort', onAbort, { once: true })
          })
        },
        async close() {
          fake.closed++
        },
      }
    },
  }
  return fake
}
