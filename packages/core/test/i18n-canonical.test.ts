import { describe, expect, it } from 'vitest'
import { isI18nAlternatePage, sameHostCanonical } from '../src/util/i18n'

describe('isI18nAlternatePage', () => {
  it('returns false when there is no x-default link', () => {
    expect(isI18nAlternatePage('https://x.com/de/page', undefined)).toBe(false)
    expect(isI18nAlternatePage('https://x.com/de/page', null)).toBe(false)
    expect(isI18nAlternatePage('https://x.com/de/page', '')).toBe(false)
  })

  it('returns false when the page IS the x-default', () => {
    expect(isI18nAlternatePage('https://x.com/page', 'https://x.com/page')).toBe(false)
    // trailing slash / hash differences are ignored
    expect(isI18nAlternatePage('https://x.com/page/', 'https://x.com/page#top')).toBe(false)
  })

  it('returns true for a localized copy pointing at a different x-default', () => {
    expect(isI18nAlternatePage('https://x.com/de/page', 'https://x.com/en/page')).toBe(true)
    expect(isI18nAlternatePage('https://x.com/de/page', '/en/page')).toBe(true)
  })

  it('fails open (false) on unparseable input', () => {
    expect(isI18nAlternatePage('not a url', 'also not a url')).toBe(false)
  })
})

describe('sameHostCanonical', () => {
  it('returns undefined when no canonical', () => {
    expect(sameHostCanonical('https://x.com/a', undefined)).toBeUndefined()
  })

  it('returns undefined when canonical is a different host', () => {
    expect(sameHostCanonical('https://x.com/a', 'https://other.com/a')).toBeUndefined()
  })

  it('returns undefined when canonical points back at the current page', () => {
    expect(sameHostCanonical('https://x.com/a', 'https://x.com/a')).toBeUndefined()
    expect(sameHostCanonical('https://x.com/a/', 'https://x.com/a')).toBeUndefined()
  })

  it('returns the resolved canonical when same-host and different', () => {
    expect(sameHostCanonical('https://x.com/a?utm=1', 'https://x.com/a')).toBe('https://x.com/a')
    expect(sameHostCanonical('https://x.com/a', '/canonical')).toBe('https://x.com/canonical')
  })
})
