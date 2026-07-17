import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerSitemapSeeds } from '../src/seeds'

async function urls(source: ReturnType<typeof workerSitemapSeeds>): Promise<string[]> {
  const values: string[] = []
  for await (const seed of source.seeds())
    values.push(seed.url)
  return values
}

describe('workerSitemapSeeds response limits', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects a sitemap whose declared body exceeds the byte limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<urlset/>', {
      headers: { 'content-length': '2048' },
    })))

    const source = workerSitemapSeeds({
      site: () => 'https://example.com',
      maxBytes: 1024,
    })

    await expect(urls(source)).resolves.toEqual([])
  })

  it('stops reading a chunked sitemap once the byte limit is crossed', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<urlset>'))
        controller.enqueue(new Uint8Array(2048))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))

    const source = workerSitemapSeeds({
      site: () => 'https://example.com',
      maxBytes: 1024,
    })

    await expect(urls(source)).resolves.toEqual([])
  })

  it('does not follow sitemap redirects across origins', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const source = workerSitemapSeeds({ site: () => 'https://example.com' })

    await expect(urls(source)).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('follows a bounded same-origin sitemap redirect', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: '/sitemap-current.xml' },
      }))
      .mockResolvedValueOnce(new Response(
        '<urlset><url><loc>https://example.com/docs</loc></url></urlset>',
      ))
    vi.stubGlobal('fetch', fetchMock)

    const source = workerSitemapSeeds({ site: () => 'https://example.com' })

    await expect(urls(source)).resolves.toEqual(['https://example.com/docs'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses the shared parser for prefixed, relative, and extension sitemap entries', async () => {
    const responses = new Map<string, string>([
      ['https://example.com/sitemap.xml', `
        <sm:sitemapindex xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sm:sitemap><sm:loc>nested/pages.xml</sm:loc></sm:sitemap>
        </sm:sitemapindex>
      `],
      ['https://example.com/nested/pages.xml', `
        <sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
          <sm:url><sm:loc><![CDATA[/one?a=1&b=2]]></sm:loc></sm:url>
          <sm:url><sm:loc>/one?a=1&amp;b=2</sm:loc></sm:url>
          <sm:url><sm:loc>two</sm:loc><image:image><image:loc>https://example.com/image.jpg</image:loc></image:image></sm:url>
        </sm:urlset>
      `],
    ])
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const body = responses.get(String(input))
      return body ? new Response(body) : new Response('missing', { status: 404 })
    }))

    const source = workerSitemapSeeds({ site: () => 'https://example.com' })

    await expect(urls(source)).resolves.toEqual([
      'https://example.com/one?a=1&b=2',
      'https://example.com/nested/two',
    ])
  })

  it('follows same-origin meta refreshes into extensionless text sitemaps', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<html><meta content="0; url=/feed" http-equiv="refresh"></html>'))
      .mockResolvedValueOnce(new Response('/one\r\nhttps://example.com/two', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const source = workerSitemapSeeds({ site: () => 'https://example.com' })

    await expect(urls(source)).resolves.toEqual([
      'https://example.com/one',
      'https://example.com/two',
    ])
  })

  it('treats maxDepth as nested index depth and skips malformed configured sitemaps', async () => {
    const fetchMock = vi.fn(async () => new Response(`
      <sitemapindex><sitemap><loc>/child.xml</loc></sitemap></sitemapindex>
    `))
    vi.stubGlobal('fetch', fetchMock)

    const source = workerSitemapSeeds({
      site: () => 'https://example.com',
      sitemaps: ['ftp://example.com/sitemap.xml', '/sitemap.xml'],
      maxDepth: 0,
    })

    await expect(urls(source)).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
