import { describe, expect, it } from 'vitest'
import { visibleRouteColumns } from '../app/features/scan/route-columns'

const ids = ['thumbnail', 'path', 'device', 'scorePerformance', 'lcp', 'scoreSeo']

describe('responsive route columns', () => {
  it('keeps navigation context and Performance on mobile', () => {
    expect(visibleRouteColumns(ids, true, {}, [])).toEqual(['path', 'device', 'scorePerformance'])
  })

  it('retains the sorted metric on mobile', () => {
    expect(visibleRouteColumns(ids, true, {}, [{ id: 'lcp', desc: true }])).toEqual(['path', 'device', 'scorePerformance', 'lcp'])
  })

  it('preserves explicit choices when resizing and keeps them reversible', () => {
    const choices = { thumbnail: false, lcp: true, scorePerformance: false }
    expect(visibleRouteColumns(ids, true, choices, [])).toEqual(['path', 'device', 'lcp'])
    expect(visibleRouteColumns(ids, false, choices, [])).toEqual(['path', 'device', 'lcp', 'scoreSeo'])
    expect(visibleRouteColumns(ids, true, choices, [])).toEqual(['path', 'device', 'lcp'])
  })
})
