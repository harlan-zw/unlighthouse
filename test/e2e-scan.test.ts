import type { AuditOpts, Auditor, LighthouseReport, Page } from '@unlighthouse/contracts/ports'
import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers/parallel-map'
import { manualSeeds } from '@unlighthouse/core/seeds/manual'
import { memoryStorage } from '@unlighthouse/core/storage/memory'

// ── Fixture HTTP server ──────────────────────────────────────────────────────

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/'
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html><head><title>${path}</title></head><body><h1>${path}</h1></body></html>`)
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address()
  if (!addr || typeof addr === 'string')
    throw new Error('failed to bind fixture server')
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function urlsFor(paths: string[]): string[] {
  return paths.map(p => `${baseUrl}${p}`)
}

function failingAuditor(failPaths: string[]): Auditor {
  const base = createMockAuditor()
  return {
    capabilities: base.capabilities,
    async audit(url: string, page?: Page, opts?: AuditOpts): Promise<LighthouseReport> {
      const u = new URL(url)
      if (failPaths.includes(u.pathname))
        throw new Error(`forced failure for ${u.pathname}`)
      return base.audit(url, page, opts)
    },
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('e2e: createUnlighthouseCore against fixture site', () => {
  it('happy path: scans 3 routes end-to-end', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: { site: baseUrl },
      auditor: createMockAuditor(),
      seeds: manualSeeds({ urls: urlsFor(['/', '/about', '/contact']) }),
      crawler: parallelMapCrawler({ concurrency: 2 }),
      storage,
    })

    const session = core.run()
    const events: { event: string, payload: any }[] = []
    ;(async () => {
      for await (const e of session.events as AsyncIterable<{ event: string, payload: any }>)
        events.push(e)
    })()

    const { scanId, summary } = await session.done

    expect(summary.routes).toBe(3)
    expect(summary.completed).toBe(3)
    expect(summary.failed).toBe(0)

    const routes = await storage.routes.listForScan(scanId)
    expect(routes.total).toBe(3)
    for (const r of routes.items)
      expect(r.url).toBeTruthy()

    // Give the events async loop one tick to drain the close.
    await new Promise(r => setTimeout(r, 10))
    const types = events.map(e => e.event)
    expect(types).toContain('scan:created')
    expect(types).toContain('scan:started')
    expect(types).toContain('scan:scanning')
    expect(types).toContain('scan:complete')
    expect(types.filter(t => t === 'scan:route-complete')).toHaveLength(3)
  }, 10_000)

  it('cancels mid-scan', async () => {
    const storage = memoryStorage()
    const paths = Array.from({ length: 10 }, (_, i) => `/p${i}`)
    const core = createUnlighthouseCore({
      config: { site: baseUrl },
      auditor: createMockAuditor(),
      seeds: manualSeeds({ urls: urlsFor(paths) }),
      crawler: parallelMapCrawler({ concurrency: 1 }),
      storage,
    })

    const session = core.run()
    const doneSettled = session.done.catch(() => null)
    let count = 0
    ;(async () => {
      for await (const _e of session.events as AsyncIterable<unknown>) {
        count++
        if (count === 2) {
          await session.cancel('test')
          break
        }
      }
    })()

    const result = await doneSettled
    expect(result).toBeNull()
    expect(session.state()).toBe('cancelled')

    const stats = session.stats()
    expect(stats.scanned).toBeLessThanOrEqual(4)
  }, 10_000)

  it('error route: one fails, others complete', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: { site: baseUrl },
      auditor: failingAuditor(['/error']),
      seeds: manualSeeds({ urls: urlsFor(['/', '/error', '/contact']) }),
      crawler: parallelMapCrawler({ concurrency: 2 }),
      storage,
    })

    const session = core.run()
    const events: { event: string, payload: any }[] = []
    ;(async () => {
      for await (const e of session.events as AsyncIterable<{ event: string, payload: any }>)
        events.push(e)
    })()

    const { summary } = await session.done

    expect(summary.failed).toBe(1)
    expect(summary.completed).toBe(2)
    expect(summary.routes).toBe(3)

    await new Promise(r => setTimeout(r, 10))
    const failed = events.find(e => e.event === 'scan:route-failed')
    expect(failed).toBeDefined()
    expect(String(failed?.payload?.url)).toContain('/error')
  }, 10_000)
})
