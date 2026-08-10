import { describe, expect, it } from 'vitest'
import { createScanProgressState } from '../app/features/scan/progress-state'

describe('live scan progress state', () => {
  it('hydrates crawler capabilities and progress snapshots on refresh', () => {
    const state = createScanProgressState()
    state.applyStatusSnapshot({
      status: 'scanning',
      discovered: 12,
      scanned: 5,
      failed: 0,
      total: 24,
      pausable: false,
    })
    state.applySummarySnapshot({
      routesScanned: 5,
      categoryAverages: { performance: 0.96 },
      distribution: { passing: 4, needsWork: 1, poor: 0 },
    } as Parameters<typeof state.applySummarySnapshot>[0])

    expect(state.pausable.value).toBe(false)
    expect(state.avgPerfScore.value).toBe(0.96)
    expect([state.passCount.value, state.needsWorkCount.value, state.poorCount.value]).toEqual([4, 1, 0])
  })

  it('uses the scanning event discovery count immediately', () => {
    const state = createScanProgressState()
    state.applyScanning({ scanId: 'scan-id', discovered: 7 } as Parameters<typeof state.applyScanning>[0])
    expect(state.discovered.value).toBe(7)
    expect(state.total.value).toBe(7)
  })
})
