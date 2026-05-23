import type { SortableRouteGroup } from '../utils/sortRoutes'
import { describe, expect, it } from 'vitest'
import { groupCategoryScore, groupOverallScore, makeRouteGroupComparator } from '../utils/sortRoutes'

// Regression tests for harlan-zw/unlighthouse#101: the routes-table sort was
// broken because the old comparator used `-1` as a null sentinel, which
// placed scanning rows at the top of an ascending sort. These tests pin the
// fix: nulls always sink, multi-device rows use max(devices), and the
// "Overall" column averages the categories present.

/**
 * Tiny row factory — produces just enough shape to satisfy
 * `SortableRouteGroup` without dragging in the full Lighthouse types.
 */
function row(scores: Partial<Record<'performance' | 'accessibility' | 'best-practices' | 'seo', number | null>>) {
  const categories: Record<string, { score: number | null }> = {}
  for (const [k, v] of Object.entries(scores)) {
    categories[k] = { score: v as number | null }
  }
  return { report: { categories } }
}

function group(opts: {
  path: string
  mobile?: ReturnType<typeof row> | null
  desktop?: ReturnType<typeof row> | null
  primary?: ReturnType<typeof row> | null
}): SortableRouteGroup {
  return {
    path: opts.path,
    mobile: opts.mobile,
    desktop: opts.desktop,
    primary: opts.primary ?? opts.mobile ?? opts.desktop ?? null,
  }
}

describe('groupCategoryScore', () => {
  it('returns the rounded 0..100 score for a single-device row', () => {
    const g = group({ path: '/', mobile: row({ performance: 0.42 }) })
    expect(groupCategoryScore(g, 'performance')).toBe(42)
  })

  it('returns the max across mobile + desktop for multi-device rows', () => {
    const g = group({
      path: '/',
      mobile: row({ performance: 0.30 }),
      desktop: row({ performance: 0.85 }),
    })
    expect(groupCategoryScore(g, 'performance')).toBe(85)
  })

  it('falls back to primary when neither mobile nor desktop carries a score', () => {
    const g: SortableRouteGroup = {
      path: '/',
      primary: row({ performance: 0.55 }),
    }
    expect(groupCategoryScore(g, 'performance')).toBe(55)
  })

  it('returns null when no device has a score for the category', () => {
    const g = group({ path: '/', mobile: row({ accessibility: 0.9 }) })
    expect(groupCategoryScore(g, 'performance')).toBeNull()
  })

  it('preserves a real zero score (not treated as missing)', () => {
    const g = group({ path: '/', mobile: row({ performance: 0 }) })
    expect(groupCategoryScore(g, 'performance')).toBe(0)
  })
})

describe('groupOverallScore', () => {
  it('averages only the categories present on the group', () => {
    const g = group({
      path: '/',
      mobile: row({ performance: 0.5, accessibility: 1.0 }),
    })
    // Mean of [50, 100] → 75
    expect(groupOverallScore(g)).toBe(75)
  })

  it('uses the max(devices) per category before averaging', () => {
    const g = group({
      path: '/',
      mobile: row({ performance: 0.2, seo: 1.0 }),
      desktop: row({ performance: 0.9, seo: 0.5 }),
    })
    // max(perf) = 90, max(seo) = 100 → mean = 95
    expect(groupOverallScore(g)).toBe(95)
  })

  it('returns null when every category is missing', () => {
    const g = group({ path: '/', mobile: row({}) })
    expect(groupOverallScore(g)).toBeNull()
  })
})

describe('makeRouteGroupComparator', () => {
  const fullyScanned = group({
    path: '/a',
    mobile: row({ 'performance': 0.7, 'accessibility': 0.9, 'best-practices': 0.8, 'seo': 1.0 }),
  })
  const partiallyScanned = group({
    path: '/b',
    mobile: row({ performance: 0.3, accessibility: 0.5 }),
  })
  const scanning = group({ path: '/c', mobile: row({}) })
  const multiDevice = group({
    path: '/d',
    mobile: row({ performance: 0.4 }),
    desktop: row({ performance: 0.95 }),
  })
  const lowScore = group({ path: '/e', mobile: row({ performance: 0.1 }) })

  function sort(rows: SortableRouteGroup[], by: Parameters<typeof makeRouteGroupComparator>[0], dir: 'asc' | 'desc') {
    return [...rows].sort(makeRouteGroupComparator(by, dir)).map(g => g.path)
  }

  it('sorts paths asc/desc alphabetically', () => {
    expect(sort([scanning, fullyScanned, lowScore], 'path', 'asc')).toEqual(['/a', '/c', '/e'])
    expect(sort([scanning, fullyScanned, lowScore], 'path', 'desc')).toEqual(['/e', '/c', '/a'])
  })

  it('sorts performance score asc with nulls at the BOTTOM (not top — fixes #101)', () => {
    const result = sort([scanning, multiDevice, fullyScanned, lowScore], 'performance', 'asc')
    // Numeric ascending: low (10), full (70), multi (max=95). Scanning has
    // no perf score and must land last — the bug was it landed first because
    // the old `?? -1` made it the smallest value.
    expect(result).toEqual(['/e', '/a', '/d', '/c'])
  })

  it('sorts performance score desc with nulls at the BOTTOM', () => {
    const result = sort([scanning, multiDevice, fullyScanned, lowScore], 'performance', 'desc')
    expect(result).toEqual(['/d', '/a', '/e', '/c'])
  })

  it('sorts the Overall column by mean(present categories) with nulls last in both directions', () => {
    const ascending = sort([scanning, partiallyScanned, fullyScanned], 'score', 'asc')
    // Partial mean = (30+50)/2 = 40; Full mean = (70+90+80+100)/4 = 85;
    // Scanning has no overall → sinks to the bottom.
    expect(ascending).toEqual(['/b', '/a', '/c'])
    const descending = sort([scanning, partiallyScanned, fullyScanned], 'score', 'desc')
    expect(descending).toEqual(['/a', '/b', '/c'])
  })

  it('uses the better device for a multi-device group when sorting', () => {
    // multiDevice has mobile=40, desktop=95 → desc places it above
    // fullyScanned (70) only because the comparator uses max(devices)=95.
    const result = sort([fullyScanned, multiDevice], 'performance', 'desc')
    expect(result).toEqual(['/d', '/a'])
  })

  it('handles an all-null row consistently in either direction', () => {
    const allNull = group({ path: '/null', mobile: row({}) })
    const a = group({ path: '/a', mobile: row({ performance: 0.5 }) })
    const b = group({ path: '/b', mobile: row({ performance: 0.8 }) })
    expect(sort([allNull, a, b], 'performance', 'asc')).toEqual(['/a', '/b', '/null'])
    expect(sort([allNull, a, b], 'performance', 'desc')).toEqual(['/b', '/a', '/null'])
  })
})
