import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { fmtCwvP75 } from '../app/features/compare/presentation'
import {
  comparePairCompatibility,
  comparisonRouteSetNotice,
  didComparePairChange,
  parseCompareQueryState,
} from '../app/features/compare/state'

const comparePage = new URL('../app/pages/sites/[siteId]/compare.vue', import.meta.url)

function scan(site: string, device: 'mobile' | 'desktop', devices: Array<'mobile' | 'desktop'> = [device]) {
  return { site, device, summary: { devices } }
}

describe('compare experience', () => {
  it('parses deep-linked table state once at the route boundary', () => {
    expect(parseCompareQueryState({
      status: 'regressed',
      device: 'desktop',
      q: '/pricing',
      page: '3',
      sort: 'delta-cls-desc',
    })).toEqual({
      status: 'regressed',
      device: 'desktop',
      q: '/pricing',
      page: 3,
      sort: 'delta-cls-desc',
    })

    expect(parseCompareQueryState({
      status: 'unknown',
      device: 'tablet',
      q: ['ignored'],
      page: '-4',
      sort: 'drop-table',
    })).toEqual({
      status: 'all',
      device: '',
      q: '',
      page: 1,
      sort: 'delta-perf-desc',
    })
  })

  it('preserves deep-linked pagination on the initial scan pair', () => {
    expect(didComparePairChange(undefined, ['base', 'current'])).toBe(false)
    expect(didComparePairChange(['base', 'current'], ['older-base', 'current'])).toBe(true)
  })

  it('blocks incompatible scan pairs before requesting a comparison', () => {
    const mobile = scan('https://example.com/', 'mobile')
    const desktop = scan('https://example.com/', 'desktop')

    expect(comparePairCompatibility({ baseScanId: 'same', currentScanId: 'same', base: mobile, current: mobile })._tag).toBe('same-scan')
    expect(comparePairCompatibility({ baseScanId: 'base', currentScanId: 'current', base: mobile, current: scan('https://other.example/', 'mobile') })._tag).toBe('different-site')
    expect(comparePairCompatibility({ baseScanId: 'base', currentScanId: 'current', base: mobile, current: desktop })._tag).toBe('no-shared-device')
  })

  it('describes partial device overlap without treating excluded devices as equivalent', () => {
    expect(comparePairCompatibility({
      baseScanId: 'base',
      currentScanId: 'current',
      base: scan('https://example.com/', 'mobile', ['mobile', 'desktop']),
      current: scan('https://example.com/', 'desktop'),
    })).toEqual({
      _tag: 'ready',
      sharedDevices: ['desktop'],
      baseOnlyDevices: ['mobile'],
      currentOnlyDevices: [],
    })
  })

  it('qualifies changed URL sets with exact counts', () => {
    expect(comparisonRouteSetNotice({ addedRoutes: 3, removedRoutes: 2 }))
      .toBe('Route set changed: 3 added, 2 removed. Summary deltas use each scan\'s full route and device population; filter route evidence to a shared device for like-for-like review.')
    expect(comparisonRouteSetNotice({ addedRoutes: 0, removedRoutes: 0 })).toBeNull()
  })

  it('keeps CLS unitless in aggregate comparison formatting', () => {
    expect(fmtCwvP75('cls', 0.004)).toBe('0.004')
    expect(fmtCwvP75('lcp', 1200)).toBe('1.2s')
  })

  it('renders explicit direction, coherent tools, recovery, and mobile targets', async () => {
    const source = await readFile(comparePage, 'utf8')

    expect(source).toContain('Current − Base')
    expect(source).toContain('Higher scores improve; lower timings and CLS improve')
    expect(source).toContain('Copy link')
    expect(source).toContain('Clear filters')
    expect(source).toContain('Retry comparison')
    expect(source).toContain(':title="otherScans.length ? \'Choose a Base scan\' : \'Run one more scan to create a baseline\'"')
    expect(source).toContain('min-h-11')
    expect(source).toContain('w-[min(24rem,calc(100vw-2rem))]')
  })
})
