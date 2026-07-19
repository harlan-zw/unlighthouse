import { describe, expect, it } from 'vitest'
import { siteSlug } from '../app/utils/site'
import { normalizeSiteUrl } from '../app/utils/site-url'

describe('normalizeSiteUrl', () => {
  it('accepts scheme-optional web addresses used by the UI forms', () => {
    expect(normalizeSiteUrl(' example.com/docs ')).toBe('https://example.com/docs')
    expect(normalizeSiteUrl('http://localhost:3000')).toBe('http://localhost:3000/')
  })

  it('rejects malformed and non-web URLs', () => {
    expect(normalizeSiteUrl('https://')).toBeNull()
    expect(normalizeSiteUrl('ftp://example.com')).toBeNull()
    expect(normalizeSiteUrl('not a valid url')).toBeNull()
    expect(normalizeSiteUrl('exa\tmple.com')).toBeNull()
    expect(normalizeSiteUrl('https://user name@example.com')).toBeNull()
    expect(normalizeSiteUrl('')).toBeNull()
  })

  it('allows whitespace outside the URL authority', () => {
    expect(normalizeSiteUrl('example.com/a useful page')).toBe('https://example.com/a%20useful%20page')
  })
})

describe('site route identity', () => {
  it('keeps non-default ports so local sites do not collide', () => {
    expect(siteSlug('http://localhost:3000/')).toBe('localhost:3000')
    expect(siteSlug('http://localhost:4000/')).toBe('localhost:4000')
    expect(siteSlug('https://example.com/')).toBe('example.com')
  })
})
