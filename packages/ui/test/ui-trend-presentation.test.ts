import { describe, expect, it } from 'vitest'
import { hasMeaningfulTrend, hasMeaningfulTrendSeries } from '../app/features/sites/trend-presentation'

describe('trend presentation', () => {
  it('requires two distinct dated observations', () => {
    expect(hasMeaningfulTrend([{ t: 1, v: 90 }])).toBe(false)
    expect(hasMeaningfulTrend([{ t: 1, v: 90 }, { t: 1, v: 95 }])).toBe(false)
    expect(hasMeaningfulTrend([{ t: 1, v: null }, { t: 2, v: 95 }])).toBe(false)
    expect(hasMeaningfulTrend([{ t: 1, v: 90 }, { t: 2, v: 95 }])).toBe(true)
  })

  it('does not expose a chart when every series has fewer than two usable observations', () => {
    expect(hasMeaningfulTrendSeries([
      { points: [{ t: 1, v: null }, { t: 2, v: 95 }] },
      { points: [{ t: 1, v: 80 }, { t: 2, v: null }] },
    ])).toBe(false)
    expect(hasMeaningfulTrendSeries([
      { points: [{ t: 1, v: 80 }, { t: 2, v: 90 }] },
      { points: [{ t: 1, v: null }, { t: 2, v: 95 }] },
    ])).toBe(true)
  })
})
