import { describe, expect, test } from 'bun:test'
import { extractLinks } from '../src/discover/links.ts'
import { parseRobots } from '../src/discover/robots.ts'
import { parseSitemap, readSitemaps } from '../src/discover/sitemap.ts'
import { inferTemplates, sampleByTemplate } from '../src/discover/templates.ts'
import { alignOrigin, isHtmlCandidate, normalizeUrl } from '../src/discover/urls.ts'

describe('normalizeUrl', () => {
  test('drops fragments, credentials and unknown query parameters', () => {
    const url = normalizeUrl('https://user:pw@example.com/a?utm_source=x&page=2&b=1#top', 'https://example.com', ['page', 'b'])
    expect(url?.href).toBe('https://example.com/a?b=1&page=2')
  })

  test('resolves relative links and refuses other schemes', () => {
    expect(normalizeUrl('../c', 'https://example.com/a/b/')?.href).toBe('https://example.com/a/c')
    expect(normalizeUrl('mailto:x@example.com', 'https://example.com')).toBeNull()
  })

  test('drops session ids carried in the path', () => {
    expect(normalizeUrl('/cart;jsessionid=A1B2?x=1', 'https://example.com')?.href).toBe('https://example.com/cart')
  })

  test('moves www/apex and http variants of the site onto its origin, nothing else', () => {
    expect(alignOrigin(new URL('http://example.com/a'), 'https://www.example.com').href).toBe('https://www.example.com/a')
    expect(alignOrigin(new URL('https://www.example.com/a'), 'https://example.com').href).toBe('https://example.com/a')
    expect(alignOrigin(new URL('https://cdn.example.com/a'), 'https://example.com').href).toBe('https://cdn.example.com/a')
    expect(alignOrigin(new URL('http://example.com:8080/a'), 'http://example.com').href).toBe('http://example.com:8080/a')
  })

  test('treats files as non-pages', () => {
    expect(isHtmlCandidate(new URL('https://example.com/report.pdf'))).toBe(false)
    expect(isHtmlCandidate(new URL('https://example.com/v1.2/docs'))).toBe(true)
    expect(isHtmlCandidate(new URL('https://example.com/page.html'))).toBe(true)
  })
})

describe('parseRobots', () => {
  const robots = parseRobots(`
User-agent: *
Disallow: /admin
Allow: /admin/public
Disallow: /*.json$
Crawl-delay: 2

User-agent: unlighthouse
User-agent: other
Disallow: /private

Sitemap: https://example.com/sitemap.xml
`)

  test('uses the group that names the agent instead of the wildcard group', () => {
    expect(robots.allows('/private/x')).toBe(false)
    expect(robots.allows('/admin')).toBe(true)
  })

  test('applies the longest match and anchors', () => {
    const wildcard = parseRobots('User-agent: *\nDisallow: /admin\nAllow: /admin/public\nDisallow: /*.json$', 'somebot')
    expect(wildcard.allows('/admin/secret')).toBe(false)
    expect(wildcard.allows('/admin/public/page')).toBe(true)
    expect(wildcard.allows('/data.json')).toBe(false)
    expect(wildcard.allows('/data.json?x=1')).toBe(true)
  })

  test('collects sitemaps and crawl delay', () => {
    expect(robots.sitemaps).toEqual(['https://example.com/sitemap.xml'])
    expect(parseRobots('User-agent: *\nCrawl-delay: 2', 'x').crawlDelayMs).toBe(2000)
  })
})

describe('sitemaps', () => {
  test('parses urlsets, indexes, CDATA and entities', () => {
    expect(parseSitemap('<urlset><url><loc>https://e.com/a?x=1&amp;y=2</loc></url><url><loc><![CDATA[https://e.com/b]]></loc></url></urlset>').pages)
      .toEqual(['https://e.com/a?x=1&y=2', 'https://e.com/b'])
    expect(parseSitemap('<sitemapindex><sitemap><loc>https://e.com/s1.xml</loc></sitemap></sitemapindex>').sitemaps)
      .toEqual(['https://e.com/s1.xml'])
  })

  test('reads plain-text sitemaps, one URL per line', () => {
    expect(parseSitemap('\uFEFFhttps://e.com/a\r\n\n  https://e.com/b  \n/relative\n')).toEqual({ pages: ['https://e.com/a', 'https://e.com/b'], sitemaps: [] })
  })

  test('follows indexes and stops at the limit', async () => {
    const files: Record<string, string> = {
      'https://e.com/sitemap.xml': '<sitemapindex><sitemap><loc>https://e.com/1.xml</loc></sitemap><sitemap><loc>https://e.com/2.xml</loc></sitemap></sitemapindex>',
      'https://e.com/1.xml': '<urlset><url><loc>https://e.com/a</loc></url><url><loc>https://e.com/b</loc></url></urlset>',
      'https://e.com/2.xml': '<urlset><url><loc>https://e.com/c</loc></url></urlset>',
    }
    const fetchText = async (url: string) => files[url] ? { status: 200, body: files[url] } : null
    expect(await readSitemaps(['https://e.com/sitemap.xml'], fetchText, 10)).toEqual(['https://e.com/a', 'https://e.com/b', 'https://e.com/c'])
    expect(await readSitemaps(['https://e.com/sitemap.xml'], fetchText, 2)).toHaveLength(2)
  })
})

describe('extractLinks', () => {
  test('reads anchors relative to <base>, canonical and noindex', async () => {
    const result = await extractLinks(`<html><head><base href="/docs/"><link rel="canonical" href="/docs/intro"><meta name="robots" content="noindex, follow"></head>
      <body><a href="setup">x</a><a href="mailto:a@b.c">m</a><a href="/file.zip" download>d</a><area href="https://other.com/"></body></html>`, 'https://e.com/docs/intro?ref=1')
    expect(result.links).toEqual(['https://e.com/docs/setup', 'https://other.com/'])
    expect(result.canonical).toBe('https://e.com/docs/intro')
    expect(result.noindex).toBe(true)
  })
})

describe('inferTemplates', () => {
  test('collapses many similar leaves under a section but keeps top-level pages', () => {
    const paths = ['/', '/about', '/pricing', '/contact', '/careers', '/blog', '/blog/first-post', '/blog/second-post', '/blog/third', '/blog/fourth']
    const templates = inferTemplates(paths)
    expect(templates.get('/about')).toBe('/about')
    expect(templates.get('/pricing')).toBe('/pricing')
    expect(templates.get('/blog')).toBe('/blog')
    expect(templates.get('/blog/third')).toBe('/blog/*')
    expect(templates.get('/')).toBe('/')
  })

  test('collapses ids even when there are few of them', () => {
    const templates = inferTemplates(['/orders/1832', '/orders/1833/items', '/users/6f1c2a8e-1d2b-4c3d-9e8f-123456789abc'])
    expect(templates.get('/orders/1832')).toBe('/orders/*')
    expect(templates.get('/orders/1833/items')).toBe('/orders/*/items')
    expect(templates.get('/users/6f1c2a8e-1d2b-4c3d-9e8f-123456789abc')).toBe('/users/*')
  })

  test('collapses sibling sections that share a shape', () => {
    const paths = ['/p/a/reviews', '/p/b/reviews', '/p/c/reviews', '/p/d/reviews', '/p/a', '/p/b', '/p/c', '/p/d']
    const templates = inferTemplates(paths)
    expect(templates.get('/p/a/reviews')).toBe('/p/*/reviews')
    expect(templates.get('/p/c')).toBe('/p/*')
  })

  test('prefers known patterns', () => {
    const templates = inferTemplates(['/docs/a/b', '/x'], ['/docs/**'])
    expect(templates.get('/docs/a/b')).toBe('/docs/**')
    expect(templates.get('/x')).toBe('/x')
  })

  test('samples per template in discovery order', () => {
    const items = ['/a', '/b/1', '/b/2', '/b/3', '/c'].map(path => ({ path, template: path.startsWith('/b/') ? '/b/*' : path }))
    const { picked, skipped } = sampleByTemplate(items, 2, 10)
    expect(picked.map(item => item.path)).toEqual(['/a', '/b/1', '/b/2', '/c'])
    expect(skipped.map(item => item.path)).toEqual(['/b/3'])
    expect(sampleByTemplate(items, 0, 3).picked).toHaveLength(3)
  })
})
