import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ConfigInput, parseConfig } from '../src/config.ts'
import type { DiscoveredPage, FetchPage, HreflangProblem } from '../src/contracts.ts'
import { openStore } from '../src/db/index.ts'
import { createDiscover, discover } from '../src/discover/crawl.ts'
import { extractLinks } from '../src/discover/links.ts'
import { parseSitemapAlternates } from '../src/discover/sitemap.ts'
import { EventBus } from '../src/events.ts'
import { operations } from '../src/ops/operations.ts'
import { invoke } from '../src/ops/registry.ts'
import { createScanner } from '../src/scan/runner.ts'
import { createFakePool } from './fixtures/fake-pool.ts'

const LANGS = ['en', 'tr', 'de'] as const
type Lang = typeof LANGS[number]
const POSTS = ['first-post', 'second-post', 'third-post', 'fourth-post']

function localized(lang: Lang, path: string): string {
  return lang === 'en' ? path : `/${lang}${path}`
}

function page(lang: string | null, head: string, body: string): Response {
  const attribute = lang ? ` lang="${lang}"` : ''
  return new Response(`<!doctype html><html${attribute}><head>${head}</head><body>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function alternate(hreflang: string, href: string): string {
  return `<link rel="alternate" hreflang="${hreflang}" href="${href}">`
}

function anchors(...hrefs: string[]): string {
  return hrefs.map(href => `<a href="${href}">${href}</a>`).join('')
}

function prefixSite() {
  const routes = new Map<string, () => Response>()
  const children: Record<string, string[]> = { '/': ['/blog'], '/blog': POSTS.map(post => `/blog/${post}`) }
  for (const path of ['/', '/blog', ...POSTS.map(post => `/blog/${post}`)]) {
    for (const lang of LANGS) {
      const own = localized(lang, path)
      let head = [...LANGS.map(other => alternate(other, localized(other, path))), alternate('x-default', path)].join('')
      if (lang === 'de' && path === '/blog/fourth-post')
        head = ''
      if (lang === 'en' && path === '/blog/first-post')
        head += alternate('de-AT', '/at/first')
      if (lang === 'en' && path === '/blog/second-post')
        head += alternate('english', path)
      if (lang === 'en' && path === '/blog/third-post')
        head += alternate('fr', '/fr/blog/third-post')
      const body = anchors(...(children[path] ?? []).map(child => localized(lang, child)))
      routes.set(own, () => page(lang, head, body))
    }
  }
  routes.set('/at/first', () => new Response(null, { status: 301, headers: { location: '/de/blog/first-post' } }))
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const route = routes.get(new URL(request.url).pathname)
      return route ? route() : new Response('not found', { status: 404 })
    },
  })
  return { server, origin: `http://127.0.0.1:${server.port}` }
}

function sitemapSite() {
  const paths = ['/', '/about']
  let origin = ''
  const entry = (lang: Lang, path: string): string => {
    const links = lang === 'de' && path === '/about'
      ? `<xhtml:link rel="alternate" hreflang="de" href="${origin}/de/about"/>`
      : [...LANGS.map(other => `<xhtml:link rel="alternate" hreflang="${other}" href="${origin}${localized(other, path)}"/>`), `<xhtml:link rel="alternate" hreflang="x-default" href="${origin}${path}"/>`].join('\n')
    return `<url><loc>${origin}${localized(lang, path)}</loc>\n${links}\n</url>`
  }
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const path = new URL(request.url).pathname
      if (path === '/sitemap.xml') {
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.flatMap(lang => paths.map(p => entry(lang, p))).join('\n')}
</urlset>`
        return new Response(body, { headers: { 'content-type': 'application/xml' } })
      }
      const known = LANGS.flatMap(lang => paths.map(p => localized(lang, p)))
      return known.includes(path) ? page(null, '', 'no language markup') : new Response('not found', { status: 404 })
    },
  })
  origin = `http://127.0.0.1:${server.port}`
  return { server, origin }
}

const prefix = prefixSite()
const sitemap = sitemapSite()

afterAll(() => {
  prefix.server.stop(true)
  sitemap.server.stop(true)
})

function config(site: string, input: ConfigInput = {}) {
  return { ...parseConfig({ ...input, site }), site }
}

function byPath(pages: DiscoveredPage[]): Map<string, DiscoveredPage> {
  return new Map(pages.map(page => [new URL(page.url).pathname, page]))
}

function sorted(problems: HreflangProblem[]): HreflangProblem[] {
  return [...problems].sort((a, b) => `${a.url} ${a.problem} ${a.target}`.localeCompare(`${b.url} ${b.problem} ${b.target}`))
}

describe('language markup', () => {
  test('extractLinks reads <html lang> and hreflang alternates relative to the page', async () => {
    const result = await extractLinks(`<html lang="tr-TR"><head>${alternate('en', '/en/')}${alternate('x-default', 'https://e.com/')}<link rel="alternate" href="/feed.xml" type="application/rss+xml"></head></html>`, 'https://e.com/tr/')
    expect(result.lang).toBe('tr-TR')
    expect(result.alternates).toEqual([{ hreflang: 'en', href: 'https://e.com/en/' }, { hreflang: 'x-default', href: 'https://e.com/' }])
  })

  test('parseSitemapAlternates reads xhtml:link alternates per <url>', () => {
    const xml = `<urlset><url><loc>https://e.com/a?x=1&amp;y=2</loc><xhtml:link rel="alternate" hreflang="tr" href="https://e.com/tr/a"/><xhtml:link rel='alternate' hreflang='x-default' href='https://e.com/a'/></url><url><loc>https://e.com/b</loc></url></urlset>`
    expect([...parseSitemapAlternates(xml)]).toEqual([['https://e.com/a?x=1&y=2', [{ hreflang: 'tr', href: 'https://e.com/tr/a' }, { hreflang: 'x-default', href: 'https://e.com/a' }]]])
  })
})

describe('multilingual discovery', () => {
  test('default audits the x-default language and lists other languages as skipped alternates in one template family', async () => {
    const result = await discover(config(prefix.origin, { discover: { robots: false, sitemap: false } }))
    const pages = byPath(result.pages)
    const audited = result.pages.filter(page => page.skipReason === null).map(page => new URL(page.url).pathname)
    expect(audited).toEqual(['/', '/blog', ...POSTS.map(post => `/blog/${post}`)])
    expect(pages.get('/')).toMatchObject({ locale: 'en', alternateOf: null, template: '/' })
    for (const lang of ['tr', 'de'] as const) {
      expect(pages.get(`/${lang}/`)).toMatchObject({ locale: lang, alternateOf: `${prefix.origin}/`, template: '/' })
      for (const post of POSTS) {
        const alt = pages.get(`/${lang}/blog/${post}`)!
        expect(alt).toMatchObject({ locale: lang, alternateOf: `${prefix.origin}/blog/${post}`, template: '/blog/*' })
        expect(alt.skipReason).toContain(`Language version (${lang}) of ${prefix.origin}/blog/${post}`)
      }
    }
    expect(pages.get('/blog/first-post')!.template).toBe('/blog/*')
    expect(result.pages).toHaveLength(18)
  })

  test('reports broken, redirected, invalid and non-reciprocal hreflang pairs', async () => {
    const result = await discover(config(prefix.origin, { discover: { robots: false, sitemap: false } }))
    const o = prefix.origin
    expect(sorted(result.hreflangProblems)).toEqual(sorted([
      { url: `${o}/blog/first-post`, hreflang: 'de-AT', target: `${o}/at/first`, problem: 'redirected-target' },
      { url: `${o}/blog/second-post`, hreflang: 'english', target: `${o}/blog/second-post`, problem: 'invalid-code' },
      { url: `${o}/blog/third-post`, hreflang: 'fr', target: `${o}/fr/blog/third-post`, problem: 'broken-target' },
      { url: `${o}/blog/fourth-post`, hreflang: 'de', target: `${o}/de/blog/fourth-post`, problem: 'missing-return-link' },
      { url: `${o}/tr/blog/fourth-post`, hreflang: 'de', target: `${o}/de/blog/fourth-post`, problem: 'missing-return-link' },
    ]))
  })

  test('all audits every language with separate templates per language', async () => {
    const result = await discover(config(prefix.origin, { discover: { robots: false, sitemap: false, locales: 'all' } }))
    const pages = byPath(result.pages)
    expect(result.pages.every(page => page.skipReason === null)).toBe(true)
    expect(result.pages).toHaveLength(18)
    expect(pages.get('/tr/blog/first-post')).toMatchObject({ locale: 'tr', template: '/tr/blog/*', alternateOf: `${prefix.origin}/blog/first-post` })
    expect(pages.get('/blog/first-post')).toMatchObject({ locale: 'en', template: '/blog/*', alternateOf: null })
  })

  test('a locale list audits only those languages and keeps the rest as skipped', async () => {
    const result = await discover(config(prefix.origin, { discover: { robots: false, sitemap: false, locales: ['en', 'TR'] } }))
    const pages = byPath(result.pages)
    expect(pages.get('/tr/blog/second-post')).toMatchObject({ skipReason: null, template: '/blog/*' })
    expect(pages.get('/de/blog/second-post')!.skipReason).toStartWith('Language de is not in discover.locales (en, TR)')
    expect(result.pages.filter(page => page.skipReason === null)).toHaveLength(12)
  })

  test('reads locales and alternates from sitemap xhtml:link when pages carry no language markup', async () => {
    const result = await discover(config(sitemap.origin, { discover: { robots: false, links: false } }))
    const pages = byPath(result.pages)
    expect(result.pages.filter(page => page.skipReason === null).map(page => new URL(page.url).pathname).sort()).toEqual(['/', '/about'])
    expect(pages.get('/tr/about')).toMatchObject({ locale: 'tr', alternateOf: `${sitemap.origin}/about`, template: '/about' })
    expect(pages.get('/de/')).toMatchObject({ locale: 'de', alternateOf: `${sitemap.origin}/` })
    expect(sorted(result.hreflangProblems)).toEqual(sorted([
      { url: `${sitemap.origin}/about`, hreflang: 'de', target: `${sitemap.origin}/de/about`, problem: 'missing-return-link' },
      { url: `${sitemap.origin}/tr/about`, hreflang: 'de', target: `${sitemap.origin}/de/about`, problem: 'missing-return-link' },
    ]))
  })

  test('follows hreflang to locale subdomains of the same site, not to other subdomains', async () => {
    const pages: Record<string, () => Response> = {
      'http://example.test/': () => page('en', [alternate('en', 'http://example.test/'), alternate('tr', 'http://tr.example.test/'), alternate('de', 'http://de.example.test/'), alternate('x-default', 'http://example.test/')].join(''), anchors('/about', 'http://my.example.test/')),
      'http://example.test/about': () => page('en', '', ''),
      'http://tr.example.test/': () => page('tr', [alternate('en', 'http://example.test/'), alternate('tr', 'http://tr.example.test/')].join(''), ''),
      'http://de.example.test/': () => page(null, '', ''),
    }
    const requested: string[] = []
    const fetchPage: FetchPage = async (url) => {
      requested.push(url)
      const response = pages[url]?.() ?? new Response('not found', { status: 404 })
      return { url, finalUrl: url, status: response.status, contentType: response.headers.get('content-type'), html: response.ok ? await response.text() : null }
    }
    const result = await createDiscover()(config('http://example.test/', { discover: { robots: false, sitemap: false } }), { fetchPage })
    expect(requested).not.toContain('http://my.example.test/')
    expect(result.pages.map(found => [found.url, found.locale, found.alternateOf, found.skipReason === null])).toEqual([
      ['http://example.test/', 'en', null, true],
      ['http://example.test/about', 'en', null, true],
      ['http://tr.example.test/', 'tr', 'http://example.test/', false],
      ['http://de.example.test/', 'de', 'http://example.test/', false],
    ])
    expect(result.hreflangProblems).toEqual([{ url: 'http://example.test/', hreflang: 'de', target: 'http://de.example.test/', problem: 'missing-return-link' }])
  })
})

describe('multilingual scans', () => {
  test('store skipped language versions with their reason and expose hreflang problems through scans.hreflang', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'unlighthouse-locales-'))
    const store = openStore(join(dir, 'data'))
    const ctx = { store, scanner: createScanner({ store, bus: new EventBus(), createPool: createFakePool({}).createPool, cpus: 12 }) }
    try {
      const started = await invoke(operations, ctx, 'scans.start', { site: prefix.origin, discover: { robots: false, sitemap: false }, sampling: { perTemplate: 0 } }) as { id: string }
      const scan = await invoke(operations, ctx, 'scans.wait', { scanId: started.id, timeoutMs: 10_000 }) as { status: string, stats: { done: number, skipped: number } }
      expect(scan.status).toBe('done')
      expect(scan.stats).toMatchObject({ done: 6, skipped: 12 })
      const skipped = await invoke(operations, ctx, 'pages.list', { scanId: started.id, status: 'skipped', search: '/tr/blog/first-post' }) as { items: Array<{ error: string, template: string }> }
      expect(skipped.items[0]).toMatchObject({ template: '/blog/*', error: expect.stringContaining(`of ${prefix.origin}/blog/first-post`) })
      const problems = await invoke(operations, ctx, 'scans.hreflang', { scanId: started.id }) as HreflangProblem[]
      expect(problems.map(problem => problem.problem).sort()).toEqual(['broken-target', 'invalid-code', 'missing-return-link', 'missing-return-link', 'redirected-target'])
      await expect(invoke(operations, ctx, 'scans.hreflang', { scanId: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    finally {
      await ctx.scanner.close()
      store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
