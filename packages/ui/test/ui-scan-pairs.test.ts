import type { Scan } from '@unlighthouse/contracts'
import { describe, expect, it } from 'vitest'
import { pairScans, scoreSummaryForDevice } from '../app/features/sites/scan-pairs'

const matrixScan = {
  scanId: 'matrix-scan',
  siteId: null,
  site: 'https://example.com/',
  mode: 'site',
  device: 'mobile',
  status: 'complete',
  startedAt: '2026-07-18T00:00:00.000Z',
  completedAt: '2026-07-18T00:01:00.000Z',
  ciBranch: null,
  ciCommit: null,
  ciCommitMessage: null,
  summary: {
    routes: 4,
    completed: 4,
    failed: 0,
    scoreAverage: 0.8,
    scoresByCategory: { performance: 0.8 },
    durationMs: 60_000,
    devices: ['mobile', 'desktop'],
    scoresByDevice: {
      mobile: { scoreAverage: 0.7, scoresByCategory: { performance: 0.7 } },
      desktop: { scoreAverage: 0.9, scoresByCategory: { performance: 0.9 } },
    },
  },
} satisfies Scan

describe('uI scan history device pairs', () => {
  it('keeps a one-id device matrix in one history row with both devices', () => {
    const pairs = pairScans([matrixScan])

    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.mobile?.scanId).toBe('matrix-scan')
    expect(pairs[0]?.desktop?.scanId).toBe('matrix-scan')
    expect(pairs[0]?.routes).toBe(4)
    expect(pairs[0]?.completed).toBe(4)
  })

  it('reads the persisted score rollup for each matrix device', () => {
    expect(scoreSummaryForDevice(matrixScan, 'mobile')?.scoresByCategory.performance).toBe(0.7)
    expect(scoreSummaryForDevice(matrixScan, 'desktop')?.scoresByCategory.performance).toBe(0.9)
  })
})
