import { describe, expect, it } from 'vitest'
import {
  effectivePageCount,
  RECOMMENDED_PAGE_LIMIT,
  recommendPageLimit,
} from '../app/features/scan/recommendations'

describe('scan recommendations', () => {
  it('caps large sites at the recommended 100 pages', () => {
    const preference = recommendPageLimit(431, { _tag: 'Automatic', value: null })

    expect(RECOMMENDED_PAGE_LIMIT).toBe(100)
    expect(preference).toEqual({ _tag: 'Automatic', value: 100 })
    expect(effectivePageCount(431, preference)).toBe(100)
  })

  it('does not cap a site already within the recommendation', () => {
    const preference = recommendPageLimit(72, { _tag: 'Automatic', value: null })

    expect(preference).toEqual({ _tag: 'Automatic', value: null })
    expect(effectivePageCount(72, preference)).toBe(72)
  })

  it('preserves a page limit the user already chose', () => {
    const preference = recommendPageLimit(800, { _tag: 'User', value: 240 })

    expect(preference).toEqual({ _tag: 'User', value: 240 })
    expect(effectivePageCount(800, preference)).toBe(240)
  })
})
