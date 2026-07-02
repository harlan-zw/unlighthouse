// D-042: perf-score honesty under pool concurrency.
//
// The local auditor runs up to `cores/2` concurrent Lighthouse audits. Concurrent
// perf runs contend for CPU and contaminate TBT/LCP/SI. This suite asserts:
//   - perf-category audits SERIALIZE by default (serial lane), even when the pool
//     is multi-worker;
//   - non-perf-only audits still run in parallel;
//   - `perfConcurrency: 'parallel'` keeps perf parallel AND flips
//     `capabilities.reliablePerfScores` to false (never both parallel + reliable);
//   - the effective concurrency is stamped onto the returned report.

import type { UnlighthouseReport } from '@unlighthouse/contracts'
import { describe, expect, it } from 'vitest'
import { createLocalAuditor } from '../packages/core/src/auditors/local'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * A fake pool task runner that tracks how many dispatches are in flight at once
 * (so a test can assert serialize vs parallel) and returns a minimal LHR.
 */
function trackingRunner(delayMs = 20) {
  const state = { inFlight: 0, maxInFlight: 0, calls: 0 }
  async function run(_payload: { url: string, options: unknown }): Promise<UnlighthouseReport> {
    state.calls++
    state.inFlight++
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
    try {
      await sleep(delayMs)
      const raw = {
        lighthouseVersion: '13.4.0',
        categories: { performance: { score: 0.9 } },
        audits: {},
      }
      return { raw } as unknown as UnlighthouseReport
    }
    finally {
      state.inFlight--
    }
  }
  return { state, run }
}

const PERF = { lighthouseFlags: { onlyCategories: ['performance'] } }
const NON_PERF = { lighthouseFlags: { onlyCategories: ['accessibility', 'seo'] } }

describe('d-042 serial perf lane', () => {
  it('serializes perf-category audits by default on a multi-worker pool', async () => {
    const { state, run } = trackingRunner()
    const auditor = createLocalAuditor({ maxThreads: 4, runLighthouseTask: run })

    await Promise.all([
      auditor.audit('https://x.com/a', undefined, PERF),
      auditor.audit('https://x.com/b', undefined, PERF),
      auditor.audit('https://x.com/c', undefined, PERF),
    ])

    expect(state.calls).toBe(3)
    // Serial lane → never more than one perf audit dispatched at a time.
    expect(state.maxInFlight).toBe(1)
    // Default (serial) keeps perf scores trustworthy.
    expect(auditor.capabilities.reliablePerfScores).toBe(true)
  })

  it('treats an audit with no onlyCategories (all categories) as perf-including', async () => {
    const { state, run } = trackingRunner()
    const auditor = createLocalAuditor({ maxThreads: 4, runLighthouseTask: run })

    await Promise.all([
      auditor.audit('https://x.com/a', undefined, {}),
      auditor.audit('https://x.com/b', undefined, {}),
    ])

    expect(state.maxInFlight).toBe(1)
  })

  it('keeps non-perf-only audits parallel', async () => {
    const { state, run } = trackingRunner()
    const auditor = createLocalAuditor({ maxThreads: 4, runLighthouseTask: run })

    await Promise.all([
      auditor.audit('https://x.com/a', undefined, NON_PERF),
      auditor.audit('https://x.com/b', undefined, NON_PERF),
      auditor.audit('https://x.com/c', undefined, NON_PERF),
    ])

    // No perf category → no lane → all three overlap.
    expect(state.maxInFlight).toBeGreaterThan(1)
  })

  it('parallel perf mode flips reliablePerfScores to false AND runs perf in parallel', async () => {
    const { state, run } = trackingRunner()
    const auditor = createLocalAuditor({ maxThreads: 4, perfConcurrency: 'parallel', runLighthouseTask: run })

    // The honesty invariant: parallel perf is never advertised as reliable.
    expect(auditor.capabilities.reliablePerfScores).toBe(false)

    await Promise.all([
      auditor.audit('https://x.com/a', undefined, PERF),
      auditor.audit('https://x.com/b', undefined, PERF),
      auditor.audit('https://x.com/c', undefined, PERF),
    ])
    expect(state.maxInFlight).toBeGreaterThan(1)
  })

  it('single-worker pool keeps perf reliable without a lane', async () => {
    const { run } = trackingRunner()
    // Even in "parallel" mode, a 1-thread pool cannot contend → reliable stays true.
    const auditor = createLocalAuditor({ maxThreads: 1, perfConcurrency: 'parallel', runLighthouseTask: run })
    expect(auditor.capabilities.reliablePerfScores).toBe(true)
  })

  it('stamps effective concurrency onto the returned report', async () => {
    const { run } = trackingRunner(1)

    const serial = createLocalAuditor({ maxThreads: 4, runLighthouseTask: run })
    const serialReport = await serial.audit('https://x.com/a', undefined, PERF) as { concurrency?: number }
    // Serial lane → the perf audit ran alone.
    expect(serialReport.concurrency).toBe(1)

    const parallel = createLocalAuditor({ maxThreads: 4, perfConcurrency: 'parallel', runLighthouseTask: run })
    const parallelReport = await parallel.audit('https://x.com/a', undefined, PERF) as { concurrency?: number }
    // Parallel perf → ran under the full pool concurrency.
    expect(parallelReport.concurrency).toBe(4)

    // Non-perf audit is never serialized, so it records the pool concurrency.
    const nonPerfReport = await serial.audit('https://x.com/b', undefined, NON_PERF) as { concurrency?: number }
    expect(nonPerfReport.concurrency).toBe(4)
  })
})
