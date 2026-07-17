import type { SeedSource } from '@unlighthouse/contracts/ports'
import { fileURLToPath } from 'node:url'
import { defaultConfig } from '@unlighthouse/contracts/config'
import { fuseSeeds, manualSeeds } from '@unlighthouse/core/seeds'
import { routeDefinitionSeeds } from '@unlighthouse/core/seeds/route-definitions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractSitemapRoutes } from '../packages/core/src/seeds/sitemap'

const fixture = (p: string) => fileURLToPath(new URL(`./fixtures/route-definitions/${p}`, import.meta.url))

async function collect(src: SeedSource): Promise<string[]> {
  const out: string[] = []
  for await (const s of src.seeds())
    out.push(s.url)
  return out
}

describe('manualSeeds', () => {
  it('yields exactly provided urls', async () => {
    const src = manualSeeds({ urls: ['/a', '/b'] })
    expect(await collect(src)).toEqual(['/a', '/b'])
  })

  it('accepts a thunk that returns urls', async () => {
    const src = manualSeeds({ urls: () => ['/x', '/y', '/z'] })
    expect(await collect(src)).toEqual(['/x', '/y', '/z'])
  })
})

describe('fuseSeeds', () => {
  it('yields seeds from each source in order (no dedupe — caller responsibility)', async () => {
    const a = manualSeeds({ urls: ['/x', '/y'] })
    const b = manualSeeds({ urls: ['/y', '/z'] })
    const fused = fuseSeeds([a, b])
    const got = await collect(fused)
    expect(got).toEqual(['/x', '/y', '/y', '/z'])
    // unique projection — what downstream Crawler is expected to produce
    expect(Array.from(new Set(got))).toEqual(['/x', '/y', '/z'])
  })
})

describe('extractSitemapRoutes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockFetch(responses: Record<string, string | null>) {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      const body = responses[url]
      if (body == null)
        return new Response('missing', { status: 404 })
      return new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } })
    }))
  }

  function config() {
    return {
      ...defaultConfig,
      site: 'https://example.com',
      scanner: { ...defaultConfig.scanner },
    } as never
  }

  it('walks sitemap indexes, decodes XML entities, and filters off-site URLs', async () => {
    mockFetch({
      'https://example.com/sitemap.xml': `
        <sitemapindex>
          <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
          <sitemap><loc>https://other.test/pages.xml</loc></sitemap>
        </sitemapindex>
      `,
      'https://example.com/pages.xml': `
        <urlset>
          <url><loc>https://example.com/a?x=1&amp;y=2</loc></url>
          <url><loc>https://blog.example.com/post</loc></url>
          <url><loc>https://elsewhere.test/nope</loc></url>
        </urlset>
      `,
    })

    const out = await extractSitemapRoutes(
      { resolvedConfig: config(), siteUrl: new URL('https://example.com') },
      'https://example.com',
      true,
    )

    expect(out.paths).toEqual([
      'https://example.com/a?x=1&y=2',
      'https://blog.example.com/post',
    ])
    expect(out.ignored).toBe(1)
    expect(out.sitemaps).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/pages.xml',
    ])
  })

  it('supports plain text sitemaps', async () => {
    mockFetch({
      'https://example.com/plain.txt': [
        '/relative',
        'https://example.com/absolute',
        'ftp://example.com/not-a-page',
      ].join('\n'),
    })

    const out = await extractSitemapRoutes(
      { resolvedConfig: config(), siteUrl: new URL('https://example.com') },
      'https://example.com',
      ['/plain.txt'],
    )

    expect(out.paths).toEqual(['https://example.com/relative', 'https://example.com/absolute'])
    expect(out.ignored).toBe(0)
  })

  it('follows same-origin meta refreshes and resolves relative prefixed sitemap entries', async () => {
    mockFetch({
      'https://example.com/sitemap.xml': '<html><meta content="0; url=/sitemaps/index.xml" http-equiv="refresh"></html>',
      'https://example.com/sitemaps/index.xml': `
        <sm:sitemapindex xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sm:sitemap><sm:loc>pages.xml</sm:loc></sm:sitemap>
        </sm:sitemapindex>
      `,
      'https://example.com/sitemaps/pages.xml': `
        <sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
          <sm:url><sm:loc><![CDATA[/one?a=1&b=2]]></sm:loc></sm:url>
          <sm:url><sm:loc>/one?a=1&amp;b=2</sm:loc></sm:url>
          <sm:url><sm:loc>two</sm:loc><image:image><image:loc>https://example.com/image.jpg</image:loc></image:image></sm:url>
        </sm:urlset>
      `,
    })

    const out = await extractSitemapRoutes(
      { resolvedConfig: config(), siteUrl: new URL('https://example.com') },
      'https://example.com',
      true,
    )

    expect(out.paths).toEqual([
      'https://example.com/one?a=1&b=2',
      'https://example.com/sitemaps/two',
    ])
    expect(out.sitemaps).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/sitemaps/index.xml',
      'https://example.com/sitemaps/pages.xml',
    ])
  })
})

describe('routeDefinitionSeeds (D-039)', () => {
  async function collectSeeds(src: SeedSource): Promise<Array<{ url: string, routeName?: string | null }>> {
    const out: Array<{ url: string, routeName?: string | null }> = []
    for await (const s of src.seeds())
      out.push({ url: s.url, routeName: s.routeName })
    return out
  }

  it('parses a Nuxt pages tree into route templates + names', async () => {
    const src = routeDefinitionSeeds({ pagesDir: fixture('nuxt/pages'), framework: 'nuxt' })
    const names = src.definitions.map(d => d.routeName).sort()
    expect(names).toEqual(['about', 'blog-slug', 'index', 'users', 'users-id', 'users-id-edit'])
  })

  it('matcher resolves URLs to the right routeName (static, dynamic, nested, catch-all)', async () => {
    const src = routeDefinitionSeeds({ pagesDir: fixture('nuxt/pages'), framework: 'nuxt' })
    expect(src.matcher('/')).toBe('index')
    expect(src.matcher('/about')).toBe('about')
    expect(src.matcher('/users')).toBe('users')
    // dynamic — a concrete id groups under the template name
    expect(src.matcher('/users/123')).toBe('users-id')
    expect(src.matcher('/users/abc')).toBe('users-id')
    // nested dynamic
    expect(src.matcher('/users/42/edit')).toBe('users-id-edit')
    // catch-all
    expect(src.matcher('/blog/2026/07/hello')).toBe('blog-slug')
    // absolute URL input is normalised to its pathname
    expect(src.matcher('https://example.com/users/7?ref=x')).toBe('users-id')
    // unmatched
    expect(src.matcher('/nope/nowhere')).toBeNull()
  })

  it('prefers a static route over a dynamic one of equal depth', async () => {
    const src = routeDefinitionSeeds({ pagesDir: fixture('nuxt/pages'), framework: 'nuxt' })
    // `/users` is static and must win over any dynamic sibling.
    expect(src.matcher('/users')).toBe('users')
  })

  it('emits seeds only for static routes, carrying the routeName hint + site origin', async () => {
    const src = routeDefinitionSeeds({ pagesDir: fixture('nuxt/pages'), framework: 'nuxt', site: 'https://example.com' })
    const seeds = await collectSeeds(src)
    // dynamic + catch-all routes are template-only (no enumerable URL)
    expect(seeds.map(s => s.url).sort()).toEqual([
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/users',
    ])
    const about = seeds.find(s => s.url === 'https://example.com/about')
    expect(about?.routeName).toBe('about')
  })

  it('parses a Next app-router tree, stripping route groups and layout files', async () => {
    const src = routeDefinitionSeeds({ pagesDir: fixture('next/app'), framework: 'next' })
    const names = src.definitions.map(d => d.routeName).sort()
    // layout.tsx is not a page; `(marketing)` group contributes no segment.
    expect(names).toEqual(['dashboard', 'index', 'posts-slug', 'pricing'])
    expect(src.matcher('/')).toBe('index')
    expect(src.matcher('/dashboard')).toBe('dashboard')
    expect(src.matcher('/posts/my-first-post')).toBe('posts-slug')
    expect(src.matcher('/pricing')).toBe('pricing')
  })

  it('is graceful when the pages dir is missing (yields nothing, matcher returns null)', async () => {
    const src = routeDefinitionSeeds({ pagesDir: fixture('does-not-exist'), framework: 'nuxt' })
    expect(src.definitions).toEqual([])
    expect(await collectSeeds(src)).toEqual([])
    expect(src.matcher('/anything')).toBeNull()
  })
})
