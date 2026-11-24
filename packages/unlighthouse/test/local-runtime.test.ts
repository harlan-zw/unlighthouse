import type { Pack } from '@unlighthouse/contracts/packs'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createLogger } from '@unlighthouse/core/logger'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { testConfig } from '../../../test/helpers/contracts'
import { configuredUrls, createLocalRuntime } from '../src/local-runtime'

const tempRoots: string[] = []

function tempOutput(): string {
  const root = mkdtempSync(join(tmpdir(), 'unl-local-runtime-'))
  tempRoots.push(root)
  const outputPath = join(root, 'output')
  mkdirSync(outputPath)
  return outputPath
}

function config() {
  return testConfig({
    auditor: { name: 'mock' },
    scanner: { sitemap: false },
  })
}

function closeRuntime(runtime: Awaited<ReturnType<typeof createLocalRuntime>>): void {
  ;(runtime.storage.db as { close?: () => void } | undefined)?.close?.()
}

async function serveSite(pages: (origin: string) => Record<string, string>) {
  const requests: { path: string, token: string | string[] | undefined }[] = []
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Expected a TCP server address')
  const origin = `http://127.0.0.1:${address.port}`
  const sitePages = pages(origin)
  server.on('request', (request, response) => {
    const path = request.url ?? '/'
    requests.push({ path, token: request.headers['x-private-token'] })
    const body = sitePages[path]
    const contentType = path.endsWith('.xml') ? 'application/xml' : 'text/html'
    response.writeHead(body === undefined ? 404 : 200, {
      'content-type': path === '/robots.txt' ? 'text/plain' : contentType,
    })
    response.end(body)
  })
  return { origin, requests, [Symbol.asyncDispose]: () => server[Symbol.asyncDispose]() }
}

function sitemap(url: string): string {
  return `<urlset><url><loc>${url}</loc></url></urlset>`
}

afterEach(() => {
  for (const root of tempRoots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

describe('createLocalRuntime interface', () => {
  it.each([
    {
      label: 'discovers the selected site’s robots.txt sitemap',
      scanner: {},
      declaredSitemap: '/pages.xml',
      lowercaseDirective: true,
      expectedRoute: '/selected-only',
      requestsRobots: true,
    },
    {
      label: 'falls back when the selected site declares a missing sitemap',
      scanner: {},
      declaredSitemap: '/missing.xml',
      expectedRoute: '/default-only',
      requestsRobots: true,
    },
    {
      label: 'uses the default sitemap if robots.txt only lists a foreign sitemap',
      scanner: {},
      declaredSitemap: null,
      expectedRoute: '/default-only',
      requestsRobots: true,
    },
    {
      label: 'uses the default sitemap with robots.txt discovery disabled',
      scanner: { robotsTxt: false },
      declaredSitemap: '/pages.xml',
      expectedRoute: '/default-only',
      requestsRobots: false,
    },
    {
      label: 'uses an explicitly configured sitemap without fetching robots.txt',
      scanner: { sitemap: ['/configured.xml'] },
      declaredSitemap: '/pages.xml',
      expectedRoute: '/configured-only',
      requestsRobots: false,
    },
  ])('$label', async ({ scanner, declaredSitemap, lowercaseDirective, expectedRoute, requestsRobots }) => {
    await using boot = await serveSite(origin => ({
      '/': '<h1>Boot</h1>',
      '/sitemap.xml': sitemap(`${origin}/boot-only`),
      '/boot-only': '<h1>Boot route</h1>',
    }))
    await using selected = await serveSite(origin => ({
      '/': '<h1>Selected site</h1>',
      '/robots.txt': [
        `Sitemap: ${boot.origin}/sitemap.xml`,
        ...(declaredSitemap ? [
          lowercaseDirective ? `sitemap: ${origin}${declaredSitemap} # primary` : `Sitemap: ${origin}${declaredSitemap}`,
        ] : []),
      ].join('\n'),
      '/sitemap.xml': sitemap(`${origin}/default-only`),
      '/pages.xml': sitemap(`${origin}/selected-only`),
      '/configured.xml': sitemap(`${origin}/configured-only`),
      '/default-only': '<h1>Default sitemap route</h1>',
      '/selected-only': '<h1>Sitemap route</h1>',
      '/configured-only': '<h1>Configured sitemap route</h1>',
    }))
    const runtime = await createLocalRuntime({
      config: testConfig({
        site: boot.origin,
        auditor: { name: 'mock' },
        scanner,
        extraHeaders: { 'x-private-token': 'only-for-boot-site' },
      }),
      output: { path: tempOutput() },
      logger: createLogger({ level: 0 }),
      env: {},
    })

    try {
      await createHandlers()['scan.start'].run({ site: selected.origin }, runtime.handlerCtx)
      const scan = runtime.core.session()
      if (!scan)
        throw new Error('Expected an active scan')
      await scan.done

      const { items } = await runtime.storage.routes.listForScan(scan.scanId)
      expect(items.map(route => route.url).toSorted()).toEqual([`${selected.origin}/`, `${selected.origin}${expectedRoute}`])
      expect(boot.requests).toEqual([])
      expect(selected.requests.some(request => request.path === '/robots.txt')).toBe(requestsRobots)
      expect(selected.requests.some(request => request.token !== undefined)).toBe(false)
    }
    finally {
      closeRuntime(runtime)
    }
  })

  it('refuses to reset a folder containing foreign files', async () => {
    const outputPath = tempOutput()
    const sentinel = join(outputPath, 'keep.txt')
    writeFileSync(sentinel, 'keep')
    await expect(createLocalRuntime({ config: config(), output: { path: outputPath, mode: 'reset' }, logger: createLogger({ level: 0 }), env: {} })).rejects.toThrow('Refusing to clear')
    expect(existsSync(sentinel)).toBe(true)
  })

  it('preserves output by default and returns one shared runtime graph', async () => {
    const outputPath = tempOutput()
    const sentinel = join(outputPath, 'keep.txt')
    writeFileSync(sentinel, 'keep', { encoding: 'utf8', flag: 'w' })

    const runtime = await createLocalRuntime({
      config: config(),
      output: { path: outputPath },
      logger: createLogger({ level: 0 }),
      env: {},
    })

    expect(existsSync(sentinel)).toBe(true)
    expect(runtime.handlerCtx.core).toBe(runtime.core)
    expect(runtime.handlerCtx.storage).toBe(runtime.storage)
    expect(runtime.handlerCtx.auditor).toBeDefined()
    closeRuntime(runtime)
  })

  it('resets only when requested and applies supplied packs after environment packs', async () => {
    const outputPath = tempOutput()
    const initial = await createLocalRuntime({ config: config(), output: { path: outputPath }, logger: createLogger({ level: 0 }), env: {} })
    closeRuntime(initial)
    const sentinel = join(outputPath, 'remove.txt')
    writeFileSync(sentinel, 'remove', { encoding: 'utf8', flag: 'w' })
    const customCrux: Pack = {
      name: 'crux',
      description: 'test override',
      version: 'test',
      reportSchema: z.object({ source: z.literal('test') }),
      reconciler: async () => ({ source: 'test' as const }),
      ui: { tab: 'test' },
    }

    const runtime = await createLocalRuntime({
      config: config(),
      output: { path: outputPath, mode: 'reset' },
      logger: createLogger({ level: 0 }),
      env: { CRUX_API_KEY: 'environment-key' },
      packs: [customCrux],
    })

    expect(existsSync(sentinel)).toBe(false)
    expect(runtime.handlerCtx.packs?.get('crux')).toBe(customCrux)
    closeRuntime(runtime)
  })
})

describe('configuredUrls', () => {
  it('resolves relative explicit paths, removes duplicates, and does not add the site', () => {
    const urls = configuredUrls(testConfig({
      site: 'https://example.com',
      urls: ['/about', ' /about ', '/pricing'],
    }))

    expect(urls).toEqual([
      'https://example.com/about',
      'https://example.com/pricing',
    ])
  })

  it('resolves URLs returned by an async provider', async () => {
    const urls = configuredUrls(testConfig({
      site: 'https://example.com',
      urls: async () => ['/docs', '/docs', 'https://other.example/contact'],
    }))

    expect(typeof urls).toBe('function')
    await expect((urls as () => Promise<string[]>)()).resolves.toEqual([
      'https://example.com/docs',
      'https://other.example/contact',
    ])
  })
})
