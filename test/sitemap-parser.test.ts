import {
  extractSitemapMetaRefreshUrl,
  parseSitemapDocument,
  resolveSitemapLocation,
} from '@unlighthouse/core/seeds/sitemap-parser'
import { describe, expect, it } from 'vitest'

describe('parseSitemapDocument', () => {
  it('parses prefixed urlsets, CDATA, numeric entities, and ignores extension locs', () => {
    const parsed = parseSitemapDocument(`\uFEFF<?xml version="1.0"?>
<!-- <sm:url><sm:loc>https://example.com/commented</sm:loc></sm:url> -->
<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <sm:url data-kind="page">
    <sm:loc><![CDATA[https://example.com/cdata?a=1&b=2]]></sm:loc>
    <image:image><image:loc>https://cdn.example.com/image.jpg</image:loc></image:image>
  </sm:url>
  <sm:url><sm:loc>https://example.com/entities?a=1&amp;b=2&#38;c=3&apos;x</sm:loc></sm:url>
</sm:urlset>`)

    expect(parsed).toEqual({
      kind: 'urlset',
      locations: [
        'https://example.com/cdata?a=1&b=2',
        'https://example.com/entities?a=1&b=2&c=3\'x',
      ],
    })
  })

  it('parses prefixed sitemap indexes and preserves relative child locations', () => {
    const parsed = parseSitemapDocument(`<?xml version="1.0"?>
<s:sitemapindex xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
  <s:sitemap><s:loc data-source="generated">pages.xml</s:loc></s:sitemap>
</s:sitemapindex>`)

    expect(parsed).toEqual({ kind: 'index', locations: ['pages.xml'] })
  })

  it('distinguishes valid empty urlsets from unsupported documents', () => {
    expect(parseSitemapDocument('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>'))
      .toEqual({ kind: 'urlset', locations: [] })
    expect(parseSitemapDocument('<!doctype html><html><body><loc>https://example.com/nope</loc></body></html>'))
      .toEqual({ kind: 'unknown', locations: [] })
  })

  it('supports BOMs, mixed newlines, and extensionless text sitemaps by content type', () => {
    const parsed = parseSitemapDocument(
      '\uFEFFhttps://example.com/one\r\n/relative\rftp://example.com/nope\nnot-a-url',
      { contentType: 'text/plain; charset=utf-8', url: 'https://example.com/feed' },
    )

    expect(parsed).toEqual({
      kind: 'text',
      locations: ['https://example.com/one', '/relative'],
    })
  })
})

describe('sitemap URL helpers', () => {
  it('resolves relative HTTP locations and rejects non-HTTP protocols', () => {
    expect(resolveSitemapLocation('pages.xml', 'https://example.com/sitemaps/index.xml'))
      .toBe('https://example.com/sitemaps/pages.xml')
    expect(resolveSitemapLocation('javascript:alert(1)', 'https://example.com/sitemap.xml')).toBeNull()
    expect(resolveSitemapLocation('ftp://example.com/sitemap.xml', 'https://example.com/sitemap.xml')).toBeNull()
  })

  it('resolves meta refreshes regardless of attribute order and decodes entities', () => {
    const html = '<html><head><meta content="0; URL=/sitemap_index.xml?a=1&amp;b=2" http-equiv="Refresh"></head></html>'
    expect(extractSitemapMetaRefreshUrl(html, 'https://example.com/sitemap.xml'))
      .toBe('https://example.com/sitemap_index.xml?a=1&b=2')
  })
})
