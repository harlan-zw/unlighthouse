import type { GapEntry } from '@unlighthouse/core/packs'
import { describe, expect, it } from 'vitest'
import { formatMetric, formFactorLabel, groupGapsByRoute, shortPath } from '../utils/cruxGaps'

// Quick factory for the verbose GapEntry shape — tests only care about the
// fields the grouper actually touches.
function gap(partial: Partial<GapEntry> & Pick<GapEntry, 'url' | 'formFactor' | 'metric'>): GapEntry {
  return {
    labVerdict: 'good',
    fieldVerdict: 'poor',
    labValue: 100,
    fieldValue: 200,
    ...partial,
  }
}

describe('groupGapsByRoute', () => {
  it('groups entries by (url, formFactor), collapsing multiple metrics into one row', () => {
    const entries: GapEntry[] = [
      gap({ url: 'https://a.test/', formFactor: 'PHONE', metric: 'lcp' }),
      gap({ url: 'https://a.test/', formFactor: 'PHONE', metric: 'cls' }),
      gap({ url: 'https://a.test/', formFactor: 'PHONE', metric: 'inp' }),
    ]
    const grouped = groupGapsByRoute(entries)
    expect(grouped).toHaveLength(1)
    const first = grouped[0]!
    expect(first.metrics).toHaveLength(3)
    expect(first.metrics.map(m => m.metric)).toEqual(['lcp', 'cls', 'inp'])
    expect(first.key).toBe('https://a.test/|PHONE')
  })

  it('treats the same URL on different form factors as separate rows', () => {
    const entries: GapEntry[] = [
      gap({ url: 'https://a.test/', formFactor: 'PHONE', metric: 'lcp' }),
      gap({ url: 'https://a.test/', formFactor: 'DESKTOP', metric: 'lcp' }),
    ]
    const grouped = groupGapsByRoute(entries)
    expect(grouped).toHaveLength(2)
    expect(grouped.map(g => g.formFactor)).toEqual(['PHONE', 'DESKTOP'])
  })

  it('preserves first-seen ordering of groups (stable rendering)', () => {
    const entries: GapEntry[] = [
      gap({ url: 'https://b.test/', formFactor: 'PHONE', metric: 'lcp' }),
      gap({ url: 'https://a.test/', formFactor: 'PHONE', metric: 'lcp' }),
      // Second hit on `b` shouldn't promote it to the top — first-seen wins.
      gap({ url: 'https://b.test/', formFactor: 'PHONE', metric: 'inp' }),
    ]
    const grouped = groupGapsByRoute(entries)
    expect(grouped.map(g => g.url)).toEqual(['https://b.test/', 'https://a.test/'])
  })

  it('returns an empty array for empty input — no buckets to surface', () => {
    expect(groupGapsByRoute([])).toEqual([])
  })
})

describe('formatMetric', () => {
  it('renders CLS as 3-decimal float (raw, no ms suffix)', () => {
    expect(formatMetric('cls', 0.1234)).toBe('0.123')
  })

  it('renders sub-second LCP/INP as integer milliseconds', () => {
    expect(formatMetric('lcp', 850.6)).toBe('851 ms')
    expect(formatMetric('inp', 200)).toBe('200 ms')
  })

  it('folds LCP >= 1s to seconds for legibility', () => {
    expect(formatMetric('lcp', 2500)).toBe('2.50 s')
  })

  it('renders nulls as em-dash so the table reads as empty, not zero', () => {
    expect(formatMetric('lcp', null)).toBe('—')
  })
})

describe('shortPath', () => {
  it('strips protocol + host', () => {
    expect(shortPath('https://example.com/pricing')).toBe('/pricing')
  })

  it('returns / for a bare origin', () => {
    expect(shortPath('https://example.com')).toBe('/')
  })

  it('preserves the search string so unique routes stay distinguishable', () => {
    expect(shortPath('https://example.com/search?q=foo')).toBe('/search?q=foo')
  })

  it('falls back to the raw input on a malformed URL', () => {
    expect(shortPath('not-a-url')).toBe('not-a-url')
  })
})

describe('formFactorLabel', () => {
  it('maps PHONE → mobile to match the rest of the dashboard vocabulary', () => {
    expect(formFactorLabel('PHONE')).toBe('mobile')
  })

  it('lower-cases DESKTOP / TABLET', () => {
    expect(formFactorLabel('DESKTOP')).toBe('desktop')
    expect(formFactorLabel('TABLET')).toBe('tablet')
  })

  it('collapses ALL_FORM_FACTORS to "all"', () => {
    expect(formFactorLabel('ALL_FORM_FACTORS')).toBe('all')
  })
})
