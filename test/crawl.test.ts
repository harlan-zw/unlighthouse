import { afterEach, describe, expect, test } from 'bun:test'
import { type ConfigInput, parseConfig } from '../src/config.ts'
import type { FetchPage } from '../src/contracts.ts'
import { createDiscover, createFetchPage, DEFAULT_USER_AGENT, discover } from '../src/discover/crawl.ts'

type Handler = (req: Request) => Response | Promise<Response>

interface Fixture {
  url: string
  origin: string
  log: Array<{ path: string, at: number, headers: Headers }>
}

const servers: Array<ReturnType<typeof Bun.serve>> = []

afterEach(() => {
  for (const server of servers.splice(0))
    server.stop(true)
})

function html(body: string, head = ''): Response {
  return new Response(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function links(...hrefs: string[]): Response {
  return html(hrefs.map(href => `<a href="${href}">${href}</a>`).join(''))
}

function serve(routes: Record<string, Handler>, fallback?: Handler): Fixture {
  const log: Fixture['log'] = []
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req) {
      const url = new URL(req.url)
      log.push({ path: url.pathname + url.search, at: Date.now(), headers: req.headers })
      const handler = routes[url.pathname] ?? fallback
      return handler ? handler(req) : new Response('not found', { status: 404 })
    },
  })
  servers.push(server)
  const origin = `http://127.0.0.1:${server.port}`
  return { url: `${origin}/`, origin, log }
}

function config(site: string, input: ConfigInput = {}) {
  return { ...parseConfig({ ...input, site }), site }
}

function paths(result: { pages: Array<{ path: string }> }): string[] {
  return result.pages.map(page => page.path)
}

describe('discover', () => {
  test('follows a root redirect and adopts the final origin', async () => {
    const target = serve({
      '/': () => links('/a', '/b'),
      '/a': () => links('/'),
      '/b': () => links('/a'),
    })
    const entry = serve({ '/': () => Response.redirect(target.url, 301), '/a': () => html('wrong origin') })
    const result = await discover(config(entry.url))
    expect(result.origin).toBe(target.origin)
    expect(result.pages.map(page => page.url)).toEqual([`${target.origin}/`, `${target.origin}/a`, `${target.origin}/b`])
    expect(entry.log.map(entry => entry.path)).toEqual(['/'])
  })

  test('returns pages in BFS order with templates and reports each one through onFound', async () => {
    const site = serve({
      '/': () => links('/blog', '/about'),
      '/blog': () => links('/blog/first-post', '/blog/second-post', '/blog/third-post', '/blog/fourth-post'),
      '/about': () => links('/team'),
      '/team': () => html('team'),
    }, () => html('post'))
    const found: Array<{ url: string, depth: number }> = []
    const result = await discover(config(site.url), { onFound: page => found.push(page) })
    expect(paths(result)).toEqual(['/', '/blog', '/about', '/blog/first-post', '/blog/second-post', '/blog/third-post', '/blog/fourth-post', '/team'])
    expect(result.pages.find(page => page.path === '/blog/third-post')?.template).toBe('/blog/*')
    expect(found.map(page => page.depth)).toEqual([0, 1, 1, 2, 2, 2, 2, 2])
  })

  test('skips robots-disallowed paths, counts them and honours crawl-delay sequentially', async () => {
    const site = serve({
      '/robots.txt': () => new Response('User-agent: *\nDisallow: /private\nCrawl-delay: 0.15\n\nUser-agent: unlighthouse\nDisallow: /private\nDisallow: /secret$\nCrawl-delay: 0.15'),
      '/': () => links('/a', '/b', '/private/x', '/private/y', '/secret', '/c'),
    }, () => html('page'))
    const result = await discover(config(site.url, { discover: { sitemap: false } }))
    expect(paths(result)).toEqual(['/', '/a', '/b', '/c'])
    expect(result.blockedByRobots).toBe(3)
    expect(result.crawlDelayMs).toBe(150)
    const pageHits = site.log.filter(hit => ['/a', '/b', '/c'].includes(hit.path))
    expect(site.log.some(hit => hit.path.startsWith('/private') || hit.path === '/secret')).toBe(false)
    for (let i = 1; i < pageHits.length; i++)
      expect(pageHits[i]!.at - pageHits[i - 1]!.at).toBeGreaterThanOrEqual(140)
  })

  test('reads robots-listed sitemap indexes with gzip and plain-text children', async () => {
    let origin = ''
    const site = serve({
      '/robots.txt': () => new Response(`User-agent: *\nDisallow: /hidden\nSitemap: ${origin}/index.xml`),
      '/index.xml': () => new Response(`<?xml version="1.0"?><sitemapindex><sitemap><loc>${origin}/pages.xml.gz</loc></sitemap><sitemap><loc>${origin}/more.txt</loc></sitemap></sitemapindex>`),
      '/pages.xml.gz': () => new Response(Bun.gzipSync(new TextEncoder().encode(`<urlset><url><loc>${origin}/x</loc></url><url><loc>${origin}/hidden/y</loc></url></urlset>`)), { headers: { 'content-type': 'application/gzip' } }),
      '/more.txt': () => new Response(`${origin}/y\n\n${origin}/z\nnot a url\n`),
      '/sitemap.xml': () => new Response(`<urlset><url><loc>${origin}/unused</loc></url></urlset>`),
      '/': () => html('no links'),
    }, () => html('page'))
    origin = site.origin
    const result = await discover(config(site.url))
    expect(paths(result)).toEqual(['/', '/x', '/y', '/z'])
    expect(result.blockedByRobots).toBe(1)
  })

  test('falls back to /sitemap.xml and caps sitemap entries at maxPages', async () => {
    let origin = ''
    const site = serve({
      '/sitemap.xml': () => new Response(`<urlset>${Array.from({ length: 50 }, (_, i) => `<url><loc>${origin}/item/${i}</loc></url>`).join('')}</urlset>`),
      '/': () => html('root'),
    }, () => html('item'))
    origin = site.origin
    const result = await discover(config(site.url, { discover: { maxPages: 10 } }))
    expect(result.pages).toHaveLength(10)
    expect(site.log.filter(hit => hit.path.startsWith('/item/')).length).toBeLessThanOrEqual(15)
  })

  test('replaces pages by their same-origin canonical and dedupes redirects to their final URL', async () => {
    const site = serve({
      '/': () => links('/shoe-red', '/shoe-blue', '/shoe', '/old', '/new', '/elsewhere'),
      '/shoe-red': () => html('red', '<link rel="canonical" href="/shoe">'),
      '/shoe-blue': () => html('blue', '<link rel="canonical" href="/shoe">'),
      '/shoe': () => html('shoe', '<link rel="canonical" href="/shoe">'),
      '/old': () => Response.redirect('/new', 301),
      '/new': () => links('/new-only'),
      '/new-only': () => html('found through a redirected page'),
      '/elsewhere': () => html('x', '<link rel="canonical" href="https://other.example/elsewhere">'),
    })
    const result = await discover(config(site.url))
    expect(paths(result)).toEqual(['/', '/shoe', '/new', '/elsewhere', '/new-only'])
  })

  test('reports broken internal links with their first referrer, network errors as status 0', async () => {
    const site = serve({
      '/': () => links('/missing', '/error', '/down', '/ok'),
      '/ok': () => links('/missing', '/also-missing'),
      '/error': () => new Response('boom', { status: 500 }),
    })
    const base = createFetchPage({ auth: parseConfig({}).auth })
    const fetchPage: FetchPage = async (url, signal) => {
      if (new URL(url).pathname === '/down')
        throw new Error('ECONNRESET')
      return base(url, signal)
    }
    const result = await discover(config(site.url), { fetchPage })
    expect(paths(result)).toEqual(['/', '/ok'])
    expect(result.broken).toEqual([
      { url: `${site.origin}/missing`, status: 404, from: site.url },
      { url: `${site.origin}/error`, status: 500, from: site.url },
      { url: `${site.origin}/down`, status: 0, from: site.url },
      { url: `${site.origin}/also-missing`, status: 404, from: `${site.origin}/ok` },
    ])
  })

  test('applies include and exclude globs to links and sitemap entries', async () => {
    let origin = ''
    const site = serve({
      '/sitemap.xml': () => new Response(`<urlset><url><loc>${origin}/shop/1</loc></url><url><loc>${origin}/blog/from-sitemap</loc></url></urlset>`),
      '/': () => links('/blog', '/shop', '/blog/a', '/blog/drafts/b'),
      '/blog': () => links('/blog/c'),
    }, () => html('page'))
    origin = site.origin
    const result = await discover(config(site.url, { discover: { include: ['/', '/blog', '/blog/**'], exclude: ['/blog/drafts/**'] } }))
    expect(paths(result)).toEqual(['/', '/blog/from-sitemap', '/blog', '/blog/a', '/blog/c'])
    expect(site.log.some(hit => hit.path.startsWith('/shop') || hit.path.startsWith('/blog/drafts'))).toBe(false)
  })

  test('stops at maxDepth and maxPages', async () => {
    const site = serve({}, (req) => {
      const n = Number(new URL(req.url).pathname.slice(2) || 0)
      return links(`/d${n + 1}`, `/d${n + 1}?utm_source=x`)
    })
    expect(paths(await discover(config(site.url, { discover: { maxDepth: 2 } })))).toEqual(['/', '/d1', '/d2'])
    const wide = serve({ '/': () => links(...Array.from({ length: 30 }, (_, i) => `/w${i}`)) }, () => html('w'))
    expect(paths(await discover(config(wide.url, { discover: { maxPages: 3 } })))).toEqual(['/', '/w0', '/w1'])
  })

  test('stops expanding a template that holds far more pages than sampling audits', async () => {
    const site = serve({
      '/': () => links('/p/1', '/docs/1'),
    }, (req) => {
      const [, section, id] = new URL(req.url).pathname.split('/')
      const n = Number(id)
      if (section === 'p')
        return links(...Array.from({ length: 10 }, (_, i) => `/p/${n * 10 + i}`))
      return links(`/docs/${n + 1}`)
    })
    const input = { discover: { maxPages: 400, maxDepth: 8 }, sampling: { perTemplate: 1 } }
    const capped = paths(await discover(config(site.url, input)))
    expect(capped.filter(path => path.startsWith('/docs/'))).toEqual(['/docs/1', '/docs/2', '/docs/3', '/docs/4', '/docs/5', '/docs/6', '/docs/7', '/docs/8'])
    expect(capped.filter(path => path.startsWith('/p/')).length).toBeGreaterThan(20)
    expect(capped.length).toBeLessThan(400)

    const uncapped = paths(await createDiscover({ expansionFactor: 0 })(config(site.url, input)))
    expect(uncapped).toHaveLength(400)
    expect(uncapped.filter(path => path.startsWith('/docs/')).length).toBeLessThan(8)
  })

  test('uses explicit urls as given: no requests, order kept, normalised, deduped, filtered', async () => {
    const site = serve({}, () => html('never fetched'))
    const found: string[] = []
    const result = await discover(config(site.url, {
      urls: ['/b', `${site.origin}/a?utm_source=x#top`, '/b', '/a', 'https://other.example/x', '/#/settings', '/admin/panel', '/items/1', '/items/2'],
      discover: { exclude: ['/admin/**'] },
    }), { onFound: page => found.push(page.url) })
    expect(site.log).toHaveLength(0)
    expect(paths(result)).toEqual(['/b', '/a', '/#/settings', '/items/1', '/items/2'])
    expect(found[2]).toBe(`${site.origin}/#/settings`)
    expect(result.pages.find(page => page.path === '/items/2')?.template).toBe('/items/*')
    expect(result.origin).toBe(site.origin)
  })

  test('sends the user agent, auth headers and cookies on every request', async () => {
    const site = serve({ '/': () => links('/a'), '/a': () => html('a') })
    await discover(config(site.url, {
      auth: { headers: { authorization: 'Bearer t' }, cookies: [{ name: 'sid', value: '1' }, { name: 'pref', value: 'dark', path: '/a' }, { name: 'other', value: 'x', domain: 'other.example' }] },
    }))
    expect(site.log.length).toBeGreaterThanOrEqual(3)
    for (const hit of site.log) {
      expect(hit.headers.get('user-agent')).toBe(DEFAULT_USER_AGENT)
      expect(hit.headers.get('authorization')).toBe('Bearer t')
    }
    expect(site.log.find(hit => hit.path === '/')?.headers.get('cookie')).toBe('sid=1')
    expect(site.log.find(hit => hit.path === '/a')?.headers.get('cookie')).toBe('sid=1; pref=dark')
  })

  test('skips non-HTML links and responses and session ids', async () => {
    const site = serve({
      '/': () => links('/report.pdf', '/feed', '/cart;jsessionid=ABC123', '/cart?sessionid=xyz', '/list?page=2'),
      '/feed': () => Response.json({ items: [] }),
    }, () => html('page'))
    const result = await discover(config(site.url, { discover: { keepQuery: ['page'] } }))
    expect(paths(result)).toEqual(['/', '/cart', '/list?page=2'])
    expect(site.log.some(hit => hit.path === '/report.pdf')).toBe(false)
  })

  test('keeps paths that differ only in case: servers treat them as different pages', async () => {
    const site = serve({
      '/': () => links('/About', '/about'),
      '/About': () => html('About the company'),
      '/about': () => html('about the product'),
    })
    const result = await discover(config(site.url))
    expect(paths(result)).toEqual(['/', '/About', '/about'])
  })

  test('keeps noindex pages: users still see them, so they are audited', async () => {
    const site = serve({
      '/': () => links('/thanks'),
      '/thanks': () => html('thanks', '<meta name="robots" content="noindex">'),
    })
    expect(paths(await discover(config(site.url)))).toEqual(['/', '/thanks'])
  })

  test('caps the body it reads and uses only what arrived', async () => {
    const site = serve({ '/': () => html(`<a href="/early">e</a>${'x'.repeat(200_000)}<a href="/late">l</a>`) }, () => html('p'))
    const fetchPage = createFetchPage({ auth: parseConfig({}).auth }, { maxBytes: 100_000 })
    expect(paths(await discover(config(site.url), { fetchPage }))).toEqual(['/', '/early'])
  })

  test('rejects when the caller aborts, even while a request hangs', async () => {
    const site = serve({ '/': () => links('/slow'), '/slow': () => new Promise<Response>(() => {}) })
    const controller = new AbortController()
    setTimeout(() => controller.abort(new Error('cancelled')), 150)
    const started = Date.now()
    await expect(discover(config(site.url), { signal: controller.signal })).rejects.toThrow('cancelled')
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  test('returns what it found when the global deadline passes', async () => {
    const site = serve({ '/': () => links('/fast', '/slow'), '/fast': () => html('fast'), '/slow': () => new Promise<Response>(() => {}) })
    const ignoresSignal: FetchPage = async (url) => {
      if (url.endsWith('/slow'))
        return new Promise(() => {})
      return createFetchPage({ auth: parseConfig({}).auth })(url)
    }
    const started = Date.now()
    const result = await createDiscover({ deadlineMs: 300 })(config(site.url), { fetchPage: ignoresSignal })
    expect(Date.now() - started).toBeLessThan(1_500)
    expect(paths(result)).toEqual(['/', '/fast'])
    expect(result.broken).toEqual([])
  })

  test('treats a request that exceeds the per-request timeout as broken', async () => {
    const site = serve({ '/': () => links('/slow', '/ok'), '/ok': () => html('ok'), '/slow': () => new Promise<Response>(() => {}) })
    const result = await createDiscover({ requestTimeoutMs: 200 })(config(site.url))
    expect(paths(result)).toEqual(['/', '/ok'])
    expect(result.broken).toEqual([{ url: `${site.origin}/slow`, status: 0, from: site.url }])
  })
})
