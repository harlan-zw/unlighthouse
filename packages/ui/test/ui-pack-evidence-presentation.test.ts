import { describe, expect, it } from 'vitest'
import { categoryCoverageSummary, formatInsightSavings, performanceSourceDetails, performanceSourceLabel } from '../app/features/scan/pack-presentation'

describe('pack evidence presentation', () => {
  it('does not claim a pass when no report was read', () => {
    expect(categoryCoverageSummary({ eligible: 3, analysed: 0, missing: 3 }, 0)).toEqual({
      title: 'No reports available for this category',
      scope: 'Reports available for 0 of 3 entries',
      missing: '3 reports unavailable',
    })
  })
  it('describes empty available findings with partial coverage', () => {
    expect(categoryCoverageSummary({ eligible: 3, analysed: 1, missing: 2 }, 0)).toEqual({
      title: 'No findings in available reports',
      scope: 'Reports available for 1 of 3 entries',
      missing: '2 reports unavailable',
    })
  })
  it('keeps findings visible beside incomplete coverage', () => {
    expect(categoryCoverageSummary({ eligible: 3, analysed: 1, missing: 2 }, 1).title).toBeNull()
  })
  it('keeps CLS estimates dimensionless and time savings in milliseconds', () => {
    expect(formatInsightSavings('CLS', 0.12)).toBe('0.120')
    expect(formatInsightSavings('LCP', 1800)).toBe('1800 ms')
    expect(formatInsightSavings('INP', 0)).toBe('0 ms')
    expect(formatInsightSavings('FCP', null)).toBe('—')
  })
  it('retains the origin population and collection period of field measurements', () => {
    expect(performanceSourceDetails({ _tag: 'field', auditor: 'crux', scope: 'origin', scopeUrl: 'https://example.com', collectionPeriod: { firstDate: '2026-09-01', lastDate: '2026-09-28' } })).toEqual([
      'Origin field data',
      'https://example.com',
      'crux',
      '2026-09-01 to 2026-09-28',
    ])
    expect(performanceSourceLabel('mixed')).toBe('Mixed measurement sources')
    expect(performanceSourceDetails({ _tag: 'unavailable', reason: 'Historical source was not retained.' })).toEqual(['Measurement source unavailable', 'Historical source was not retained.'])
  })
})
