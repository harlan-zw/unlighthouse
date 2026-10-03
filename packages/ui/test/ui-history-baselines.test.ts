import type { Scan } from '@unlighthouse/contracts'
import { describe, expect, it } from 'vitest'
import { comparisonForLoadedScan, latestLoadedComparison } from '../app/features/sites/history-baselines'

function scan(scanId: string, startedAt: string, overrides: Partial<Scan> = {}): Scan {
  return {
    scanId,
    startedAt,
    siteId: null,
    site: 'https://example.com/',
    mode: 'site',
    device: 'mobile',
    status: 'complete',
    completedAt: startedAt,
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
    summary: { routes: 1, completed: 1, failed: 0, scoreAverage: 0.8, scoresByCategory: { performance: 0.8 }, durationMs: 1000 },
    ...overrides,
  }
}

const older = scan('older', '2026-10-01T00:00:00.000Z')
const current = scan('current', '2026-10-02T00:00:00.000Z')
const newer = scan('newer', '2026-10-03T00:00:00.000Z')

describe('loaded history comparison links', () => {
  it('uses the nearest strictly older scan, even when a newer scan is loaded', () => {
    const result = comparisonForLoadedScan(current, [newer, older, current], 'mobile')
    expect(result).toMatchObject({ base: older, current, device: 'mobile' })
    expect(result?.to).toBe('/sites/example.com/compare?current=current&base=older&device=mobile')
  })

  it.each([
    { status: 'scanning' as const },
    { status: 'cancelled' as const },
    { site: 'http://example.com/' },
    { device: 'desktop' as const },
    { startedAt: current.startedAt },
    { startedAt: 'invalid' },
    { summary: null },
  ])('rejects an ineligible baseline %j', (override) => {
    expect(comparisonForLoadedScan(current, [scan('candidate', older.startedAt, override)], 'mobile')).toBeNull()
  })

  it('preserves a current branch restriction and rejects incomplete current scans', () => {
    const branchCurrent = { ...current, ciBranch: 'v1' }
    expect(comparisonForLoadedScan(branchCurrent, [{ ...older, ciBranch: 'main' }], 'mobile')).toBeNull()
    expect(comparisonForLoadedScan({ ...current, status: 'error' }, [older], 'mobile')).toBeNull()
  })

  it('supports the selected device of a matrix scan without crossing device IDs', () => {
    const matrix = { ...current, summary: { ...current.summary!, devices: ['mobile', 'desktop'] as const } }
    const desktop = { ...older, device: 'desktop' as const }
    expect(comparisonForLoadedScan(matrix, [older, desktop], 'desktop')).toMatchObject({ base: desktop, device: 'desktop' })
  })

  it('uses deterministic IDs for tied eligible baselines and does not invent absent history', () => {
    expect(comparisonForLoadedScan(current, [older, { ...older, scanId: 'a' }], 'mobile')?.base.scanId).toBe('a')
    expect(comparisonForLoadedScan(older, [older], 'mobile')).toBeNull()
    expect(latestLoadedComparison([older, newer, current], 'mobile')?.current.scanId).toBe('newer')
  })
})
