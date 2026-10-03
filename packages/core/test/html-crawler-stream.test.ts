import type { CrawlEvent, SeedSource } from '@unlighthouse/contracts'
import { createServer } from 'node:http'
import { htmlCrawler } from '@unlighthouse/core/crawlers'
import { describe, expect, it } from 'vitest'

function seedsFor(urls: string[]): SeedSource {
  return {
    async* seeds() {
      for (const url of urls)
        yield { url, source: 'test' }
    },
  }
}

async function fixture(pages: Record<string, string | { status: number, headers?: Record<string, string>, body?: string }>) {
  const requests: string[] = []
  const server = createServer((req, res) => {
    requests.push(req.url!)
    const page = pages[req.url!] ?? { status: 404 }
    if (typeof page === 'string') {
      res.setHeader('content-type', 'text/html')
      res.end(page)
    }
    else {
      res.writeHead(page.status, page.headers)
      res.end(page.body)
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Fixture has no address')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
      server.closeAllConnections()
    }),
  }
}

describe('hTML crawler', () => {
  it('audits the first seed while later seeds are still being discovered', async () => {
    const site = await fixture({ '/': '<h1>Home</h1>', '/later': '<h1>Later</h1>' })
    const release = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const seeds: SeedSource = {
      async* seeds() {
        yield { url: site.origin, source: 'test' }
        await release.promise
        yield { url: `${site.origin}/later`, source: 'test' }
      },
    }
    const audits: string[] = []
    const consume = (async () => {
      for await (const _event of htmlCrawler().run({
        seeds,
        audit: async (url) => { audits.push(url); started.resolve() },
      })) { /* Drain the public event stream. */ }
    })()
    try {
      const result = await Promise.race([started.promise.then(() => 'started'), new Promise<string>(resolve => setTimeout(resolve, 300, 'blocked'))])
      expect(result).toBe('started')
    }
    finally {
      release.resolve()
      await consume
      await site.close()
    }
    expect(audits.map(url => new URL(url).pathname)).toEqual(['/', '/later'])
  })

  it('resolves redirected links, deduplicates URLs, and applies the route policy before fetching', async () => {
    const site = await fixture({
      '/': '<a href="/old">Old</a><a href="/blocked">Blocked</a><a href="/old#again">Again</a><a href="mailto:test@example.com">Mail</a>',
      '/old': { status: 302, headers: { location: '/nested/page' } },
      '/nested/page': '<a href="child?x=1&amp;y=2">Child</a><a href="https://offsite.test/">Offsite</a>',
      '/nested/child?x=1&y=2': '<p>Done</p>',
    })
    const audits: string[] = []
    try {
      for await (const _event of htmlCrawler().run({ seeds: seedsFor([site.origin]), allows: url => !url.endsWith('/blocked'), audit: async (url) => { audits.push(url) } })) { /* Drain. */ }
      expect(audits.map(url => new URL(url).pathname + new URL(url).search)).toEqual(['/', '/nested/page', '/nested/child?x=1&y=2'])
      expect(site.requests).not.toContain('/blocked')
      expect(site.requests.filter(url => url === '/old')).toHaveLength(1)
    }
    finally { await site.close() }
  })

  it('discovers canonical and x-default targets while skipping localized duplicate audits', async () => {
    const site = await fixture({
      '/': '<a href="/fr">French</a>',
      '/fr': '<link rel="alternate" hreflang="x-default" href="/en"><link rel="canonical" href="/canonical">',
      '/en': '<p>English</p>',
      '/canonical': '<p>Canonical</p>',
    })
    const audits: string[] = []
    try {
      for await (const _event of htmlCrawler().run({ seeds: seedsFor([site.origin]), ignoreI18nPages: true, audit: async (url) => { audits.push(new URL(url).pathname) } })) { /* Drain. */ }
      expect(audits.sort()).toEqual(['/', '/canonical', '/en'])
    }
    finally { await site.close() }
  })

  it('limits discovered routes and does not follow links in page mode', async () => {
    const site = await fixture({ '/': '<a href="/one">One</a><a href="/two">Two</a>', '/one': '<p>One</p>', '/two': '<p>Two</p>' })
    try {
      const audits: string[] = []
      for await (const _event of htmlCrawler().run({ seeds: seedsFor([site.origin]), maxRoutes: 2, audit: async (url) => { audits.push(new URL(url).pathname) } })) { /* Drain. */ }
      expect(audits).toEqual(['/', '/one'])
      const pageAudits: string[] = []
      for await (const _event of htmlCrawler().run({ seeds: seedsFor([site.origin]), noFollow: true, audit: async (url) => { pageAudits.push(new URL(url).pathname) } })) { /* Drain. */ }
      expect(pageAudits).toEqual(['/'])
    }
    finally { await site.close() }
  })

  it('reports HTTP and audit failures without losing successful routes', async () => {
    const site = await fixture({ '/': '<a href="/missing">Missing</a><a href="/bad-audit">Bad</a>', '/bad-audit': '<p>Bad</p>' })
    const events: CrawlEvent[] = []
    try {
      for await (const event of htmlCrawler().run({ seeds: seedsFor([site.origin]), audit: async (url) => {
        if (url.endsWith('/bad-audit'))
          throw new Error('Audit failed')
      } })) events.push(event)
      expect(events.filter(e => e.type === 'url-failed').map(e => new URL(e.url).pathname).sort()).toEqual(['/bad-audit', '/missing'])
      expect(events).toContainEqual({ type: 'url-completed', url: `${site.origin}/` })
    }
    finally { await site.close() }
  })
})

it('aborts a hanging HTML response and restores idle state', async () => {
  const controller = new AbortController()
  const crawler = htmlCrawler({ fetch: async (_input, init) => {
    controller.abort()
    init?.signal?.throwIfAborted()
    throw new Error('Abort did not propagate')
  } })
  const events: CrawlEvent[] = []
  for await (const event of crawler.run({ seeds: seedsFor(['http://localhost/']), signal: controller.signal, audit: async () => { throw new Error('Must not audit') } })) events.push(event)
  expect(events.filter(event => event.type === 'url-failed')).toEqual([])
  expect(crawler.state?.()).toBe('idle')
})

it('caps HTML bytes, retries transport failures once, and isolates credentials across redirects', async () => {
  const requests: Array<{ url: string, headers: Headers }> = []
  let failed = false
  const crawler = htmlCrawler({
    site: 'https://example.test',
    maxHtmlBytes: 16,
    fetchConfig: { auth: { username: 'test', password: 'secret' }, extraHeaders: { 'x-private': 'secret' } },
    fetch: async (input, init) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) })
      if (!failed) {
        failed = true
        throw new Error('Connection reset')
      }
      if (String(input) === 'https://example.test/')
        return new Response(null, { status: 302, headers: { location: 'https://other.test/' } })
      return new Response('a'.repeat(17), { headers: { 'content-type': 'text/html' } })
    },
  })
  const events: CrawlEvent[] = []
  for await (const event of crawler.run({ seeds: seedsFor(['https://example.test/']), audit: async () => { throw new Error('Must not audit') } })) events.push(event)
  expect(requests).toHaveLength(3)
  expect(requests[0]!.headers.get('authorization')).toMatch(/^Basic /)
  expect(requests[2]!.headers.get('authorization')).toBeNull()
  expect(requests[2]!.headers.get('x-private')).toBeNull()
  expect(events.find(event => event.type === 'url-failed')).toMatchObject({ error: { message: 'HTML exceeds 16 bytes: https://other.test/' } })
})

it('bounds active audits and resets discovery between runs', async () => {
  const crawler = htmlCrawler({ concurrency: 2, fetch: async () => new Response('<p>Page</p>', { headers: { 'content-type': 'text/html' } }) })
  let active = 0
  let peak = 0
  const audits: string[] = []
  for (let run = 0; run < 2; run++) {
    for await (const _event of crawler.run({ seeds: seedsFor(['http://localhost/one', 'http://localhost/two', 'http://localhost/three']), audit: async (url) => {
      active++
      peak = Math.max(peak, active)
      audits.push(url)
      await new Promise(resolve => setTimeout(resolve, 5))
      active--
    } })) { /* Drain. */ }
  }
  expect(peak).toBe(2)
  expect(audits).toHaveLength(6)
})

it('finishes at the route limit without asking for another seed', async () => {
  const seeds: SeedSource = { async* seeds() {
    yield { url: 'http://localhost/', source: 'test' }
    throw new Error('Should not request another seed')
  } }
  const audits: string[] = []
  for await (const _event of htmlCrawler({ fetch: async () => new Response('<p>Page</p>', { headers: { 'content-type': 'text/html' } }) }).run({ seeds, maxRoutes: 1, audit: async (url) => { audits.push(url) } })) { /* Drain. */ }
  expect(audits).toEqual(['http://localhost/'])
})

it('retries a transient HTTP failure before auditing the page', async () => {
  let requests = 0
  const audited: string[] = []
  const crawler = htmlCrawler({ fetch: async () => {
    requests++
    return requests === 1
      ? new Response('Busy', { status: 503, headers: { 'retry-after': '0' } })
      : new Response('<h1>Recovered</h1>', { headers: { 'content-type': 'text/html' } })
  } })
  for await (const _event of crawler.run({ seeds: seedsFor(['http://localhost/']), audit: async (url) => { audited.push(url) } })) { /* Drain. */ }
  expect(requests).toBe(2)
  expect(audited).toEqual(['http://localhost/'])
})

it('decodes links using the response charset', async () => {
  const audited: string[] = []
  const crawler = htmlCrawler({ fetch: async () => new Response(Buffer.from('<a href="/café">Page</a>', 'latin1'), { headers: { 'content-type': 'text/html; charset=iso-8859-1' } }) })
  for await (const _event of crawler.run({ seeds: seedsFor(['http://localhost/']), audit: async (url) => { audited.push(url) } })) { /* Drain. */ }
  expect(audited).toEqual(['http://localhost/', 'http://localhost/caf%C3%A9'])
})
