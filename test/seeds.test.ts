import type { SeedSource } from '@unlighthouse/contracts/ports'
import { defaultConfig } from '@unlighthouse/contracts/config'
import { fuseSeeds, manualSeeds } from '@unlighthouse/core/seeds'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractSitemapRoutes } from '../packages/core/src/seeds/sitemap'

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

    expect(out.paths).toEqual(['/relative', 'https://example.com/absolute'])
    expect(out.ignored).toBe(0)
  })
})
