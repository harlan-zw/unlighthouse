import type { Scan } from '@unlighthouse/contracts'
import { describe, expect, it } from 'vitest'
import { createFormatters } from '../app/composables/useFormat'
import { resolveScanOverviewStatus } from '../app/features/scan/status-presentation'
import { statusForPair } from '../app/features/sites/scan-pairs'

function scan(status: Scan['status'], completed = 0): Scan {
  return {
    scanId: `${status}-scan`,
    siteId: null,
    site: 'https://example.com/',
    mode: 'site',
    device: 'mobile',
    status,
    startedAt: '2026-08-10T00:00:00.000Z',
    completedAt: status === 'complete' || status === 'cancelled' ? '2026-08-10T00:01:00.000Z' : null,
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
    summary: completed > 0
      ? {
          routes: 10,
          completed,
          failed: 0,
          scoreAverage: 0.9,
          scoresByCategory: { performance: 0.9 },
          durationMs: 60_000,
          devices: ['mobile'],
        }
      : null,
  }
}

describe('uI review regressions', () => {
  it('keeps active and cancelled lifecycle states authoritative over partial summaries', () => {
    expect(resolveScanOverviewStatus({
      metaStatus: 'scanning',
      hasSummary: true,
      isCurrent: true,
      storeStatus: 'scanning',
      remoteStatus: 'scanning',
    })).toBe('scanning')

    expect(resolveScanOverviewStatus({
      metaStatus: 'cancelled',
      hasSummary: true,
      isCurrent: false,
      storeStatus: null,
      remoteStatus: 'cancelled',
    })).toBe('cancelled')
  })

  it('presents cancelled history rows as cancelled, not failed', () => {
    expect(statusForPair({
      startedAt: '2026-08-10T00:00:00.000Z',
      routes: 10,
      completed: 4,
      mobile: scan('cancelled', 4),
      desktop: null,
    })).toEqual({ label: 'cancelled', status: 'warning' })
  })

  it('formats CLS as a unitless value in comparisons', () => {
    const { fmtDelta, fmtMetric, fmtPercent } = createFormatters()
    expect(fmtMetric(0.003, false, 'cls')).toBe('0.003')
    expect(fmtDelta(0, false, 'cls')).toBe('0.000')
    expect(fmtDelta(0.015, false, 'cls')).toBe('+0.015')
    expect(fmtDelta(-81, false, 'lcp')).toBe('-81ms')
    expect(fmtPercent(43.100771176027244)).toBe('43.1%')
    expect(fmtPercent(92.13661325979798)).toBe('92.1%')
  })
})
