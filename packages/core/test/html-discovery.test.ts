import { describe, expect, it } from 'vitest'
import { extractPageDiscovery } from '../src/util/html-discovery'

describe('extractPageDiscovery', () => {
  it('uses parsed HTML attributes and keeps unique same-origin page links', () => {
    const result = extractPageDiscovery({
      html: `
        <meta name="robots" content="index,follow">
        <a href=/about#team>About</a>
        <a href="/about">Duplicate</a>
        <a href="/private" rel="nofollow">Private</a>
        <a href="https://other.example/path">Elsewhere</a>
        <a href="/asset.js">Asset</a>
        <a href="/cdn-cgi/content?id=trap-token">Cloudflare trap</a>
      `,
      pageUrl: 'https://example.com/',
      siteUrl: 'https://example.com/',
    })

    expect(result.pageIndexable).toBe(true)
    expect(result.links).toEqual(['https://example.com/about'])
    expect(result.cloudflareTrapLinks).toBe(1)
    expect(result.malformedLinks).toEqual([])
  })

  it('honours page-level noindex and nofollow', () => {
    const result = extractPageDiscovery({
      html: '<meta name="robots" content="none"><a href="/about">About</a>',
      pageUrl: 'https://example.com/',
      siteUrl: 'https://example.com/',
    })

    expect(result.pageIndexable).toBe(false)
    expect(result.links).toEqual([])
  })
})
