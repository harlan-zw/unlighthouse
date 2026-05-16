// E2E: HTTP projection + typed client over a real listhen-hosted h3 server.
//
// Wires `createHttpRouter({ handlers, ctx })` into an h3 App, exposes it via
// listhen on a random port, and exercises every interesting flow from the
// generated `createClient({ baseUrl })` — health, manifest, scan lifecycle
// round-trip, error mapping, and the NDJSON streaming subscribe channel.

import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commands } from '@unlighthouse/contracts'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createClient } from '@unlighthouse/core/api/client'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createHttpRouter } from '@unlighthouse/core/api/http'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers/parallel-map'
import { manualSeeds } from '@unlighthouse/core/seeds/manual'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { createApp, toNodeListener } from 'h3'

// ── Fixture HTML server + API server ────────────────────────────────────────

let fixtureServer: Server
let apiServer: Server
let fixtureBaseUrl: string
let apiBaseUrl: string
let core: ReturnType<typeof createUnlighthouseCore>
let client: ReturnType<typeof createClient>

beforeAll(async () => {
  // 1. Static fixture site (target of the scan).
  fixtureServer = createServer((req, res) => {
    const path = req.url ?? '/'
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html><head><title>${path}</title></head><body><h1>${path}</h1></body></html>`)
  })
  await new Promise<void>((resolve) => {
    fixtureServer.listen(0, '127.0.0.1', () => resolve())
  })
  const fAddr = fixtureServer.address()
  if (!fAddr || typeof fAddr === 'string')
    throw new Error('failed to bind fixture server')
  fixtureBaseUrl = `http://127.0.0.1:${fAddr.port}`

  // 2. Real core + ctx — same shape the Cloudflare preset uses.
  const storage = memoryStorage()
  const auditor = createMockAuditor()
  core = createUnlighthouseCore({
    config: { site: fixtureBaseUrl } as never,
    auditor,
    seeds: manualSeeds({ urls: [`${fixtureBaseUrl}/`, `${fixtureBaseUrl}/about`] }),
    crawler: parallelMapCrawler({ concurrency: 1 }),
    storage,
  })
  const ctx: HandlerCtx = {
    core,
    auditor,
    storage,
    config: { site: fixtureBaseUrl } as never,
  }

  // 3. Project the command registry → h3 router → App → Node listener.
  // toNodeListener requires an App (not a Router), so wrap.
  const router = createHttpRouter({ handlers: createHandlers(), ctx })
  const app = createApp()
  // Mount router under /api so client baseUrl `${url}/api` lines up.
  app.use('/api', router.handler)
  apiServer = createServer(toNodeListener(app))
  await new Promise<void>((resolve) => {
    apiServer.listen(0, '127.0.0.1', () => resolve())
  })
  const aAddr = apiServer.address()
  if (!aAddr || typeof aAddr === 'string')
    throw new Error('failed to bind api server')
  apiBaseUrl = `http://127.0.0.1:${aAddr.port}/api`

  client = createClient({ baseUrl: apiBaseUrl })
}, 10_000)

afterAll(async () => {
  await new Promise<void>(r => fixtureServer.close(() => r()))
  await new Promise<void>(r => apiServer.close(() => r()))
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('e2e: HTTP projection over the wire', () => {
  it('health + manifest', async () => {
    const health = await client.health({}) as { ok: boolean }
    expect(health.ok).toBe(true)

    const manifest = await client.manifest({}) as {
      commands: unknown[]
      defaults: Record<string, unknown>
    }
    expect(manifest.commands.length).toBe(Object.keys(commands).length)
    expect(manifest.commands.length).toBe(34)
    expect(Object.keys(manifest.defaults).length).toBeGreaterThan(0)
  })

  it('lifecycle round-trip: scan.current → run → status → results', async () => {
    // No session yet.
    const before = await client['scan.current']({}) as { scanId: string | null }
    expect(before.scanId).toBeNull()

    // Bootstrap the session host-side (scan.start needs config wiring we skip).
    const session = core.run()

    const current = await client['scan.current']({}) as { scanId: string }
    expect(current.scanId).toBe(session.scanId)

    const status = await client['scan.status']({ scanId: session.scanId }) as {
      status: string
    }
    expect(['starting', 'discovering', 'scanning', 'complete']).toContain(status.status)

    const { scanId } = await session.done

    // Note: numeric `page`/`pageSize` would be sent as strings over GET and
    // rejected by Zod (INPUT_INVALID). Defaults kick in when omitted —
    // surfacing a real coercion gap in the http projection (see report).
    const results = await client['scan.results']({ scanId } as never) as {
      items: unknown[]
      total: number
    }
    expect(results.items.length).toBe(2)
    expect(results.total).toBe(2)
  }, 15_000)

  it('error mapping: unknown scanId → 404 + UnlighthouseError name', async () => {
    let caught: Error | null = null
    await client['route.get']({
      scanId: '00000000-0000-0000-0000-000000000000',
      url: 'http://localhost/',
    } as never).catch((err: Error) => { caught = err })
    expect(caught).not.toBeNull()
    // statusForCode maps SCAN_NOT_FOUND / ROUTE_NOT_FOUND → 404.
    expect(['SCAN_NOT_FOUND', 'ROUTE_NOT_FOUND']).toContain(caught!.name)
  })

  it('events.subscribe streams NDJSON shaped {event, payload}', async () => {
    // Start a fresh session so the subscribe iterator picks up events.
    // The previous test's session already resolved; core is single-session.
    const session = core.run()

    // Omit numeric `replay`: serializing it over GET hits the same Zod
    // coercion gap as scan.results above.
    const stream = client['events.subscribe']({
      scanId: session.scanId,
    } as never) as AsyncIterable<{ event: string, payload: unknown }>

    const collected: { event: string, payload: unknown }[] = []
    for await (const ev of stream) {
      collected.push(ev)
      if (collected.length >= 3)
        break
    }
    // Drain session so afterAll teardown is clean.
    await session.done.catch(() => null)

    expect(collected.length).toBe(3)
    for (const ev of collected) {
      expect(typeof ev.event).toBe('string')
      expect(ev.event.length).toBeGreaterThan(0)
      expect(ev).toHaveProperty('payload')
    }
  }, 15_000)
})
