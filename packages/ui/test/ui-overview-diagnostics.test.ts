import { describe, expect, it } from 'vitest'
import { overviewDistributionRows, overviewRoutePath, parseOverviewFixes } from '../app/features/scan/overview-diagnostics'

describe('overview diagnostics', () => {
  it('keeps a zero-entry scan at zero without invalid percentages', () => {
    expect(overviewDistributionRows(0, { passing: 0, needsWork: 0, poor: 0 })).toEqual([])
  })

  it('counts unavailable scores separately instead of treating them as poor scores', () => {
    expect(overviewDistributionRows(4, { passing: 1, needsWork: 1, poor: 0 })).toEqual([
      { band: 'passing', count: 1, pct: 25 },
      { band: 'needsWork', count: 1, pct: 25 },
      { band: 'unscored', count: 2, pct: 50 },
    ])
  })

  it('preserves encoded audited paths, search parameters and SPA hashes', () => {
    expect(overviewRoutePath('https://example.com/app?lang=fr#/docs/a%20b')).toBe('/app#/docs/a%20b?lang=fr')
    expect(overviewRoutePath('https://example.com/search?q=%E2%9C%93#heading')).toBe('/search?q=%E2%9C%93')
  })

  it('distinguishes absent and invalid CWV reports', () => {
    expect(parseOverviewFixes(undefined)).toEqual({ _tag: 'Unavailable' })
    expect(parseOverviewFixes({ topFixes: [] })).toEqual({ _tag: 'Invalid' })
  })

  it('retains the pack ranking and separates each insight metric', () => {
    const result = parseOverviewFixes({
      scanId: 'test',
      routesAnalysed: 8,
      metrics: [],
      passesCoreWebVitals: false,
      topFixes: [
        { insight: 'blocking', title: 'Remove blocking', metric: 'lcp', maxImpactMs: 700, routeCount: 4, routes: [] },
        { insight: 'blocking', title: 'Remove blocking', metric: 'fcp', maxImpactMs: 500, routeCount: 3, routes: [] },
        { insight: 'images', title: 'Resize images', metric: 'lcp', maxImpactMs: 400, routeCount: 2, routes: [] },
        { insight: 'fonts', title: 'Load fonts', metric: 'fcp', maxImpactMs: 200, routeCount: 1, routes: [] },
      ],
    })
    expect(result._tag).toBe('Ready')
    if (result._tag !== 'Ready')
      throw new Error('Expected parsed CWV fixes')
    expect(result.fixes.map(fix => [fix.insight, fix.metric, fix.maxImpactMs, fix.routeCount])).toEqual([
      ['blocking', 'lcp', 700, 4],
      ['blocking', 'fcp', 500, 3],
      ['images', 'lcp', 400, 2],
    ])
  })

  it('distinguishes no measured routes from measured routes with no estimated fixes', () => {
    const report = { scanId: 'test', routesAnalysed: 0, metrics: [], passesCoreWebVitals: false, topFixes: [] }
    expect(parseOverviewFixes(report)).toEqual({ _tag: 'Unavailable' })
    expect(parseOverviewFixes({ ...report, routesAnalysed: 1 })).toEqual({ _tag: 'Ready', fixes: [] })
  })
})
