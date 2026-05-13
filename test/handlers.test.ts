// Unit tests for the handler set: each handler runs against a fixture ctx
// (memory storage + mock auditor + stub core). We verify output shape via
// the command's Zod `output.safeParse` rather than strict equality.

import type { CrawlSession, Scan, ScanRoute, UnlighthouseConfig, UnlighthouseCore } from '@unlighthouse/contracts'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers/types'
import { gzipSync } from 'node:zlib'
import { commands, UnlighthouseError } from '@unlighthouse/contracts'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'

// ── fixtures ────────────────────────────────────────────────────────────────

const SCAN_ID = 'scan-fixture-0001'
const OTHER_SCAN_ID = 'scan-fixture-0002'
const FIXTURE_URL = 'https://example.com/'

function makeScan(id: string = SCAN_ID): Scan {
  return {
    scanId: id as Scan['scanId'],
    site: 'https://example.com',
    device: 'mobile',
    status: 'complete',
    startedAt: '2025-01-01T00:00:00.000Z',
    completedAt: '2025-01-01T00:05:00.000Z',
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
    summary: {
      routes: 1,
      completed: 1,
      failed: 0,
      scoreAverage: 0.9,
      scoresByCategory: { performance: 0.9 },
      durationMs: 1234,
    },
  }
}

function makeRoute(): ScanRoute {
  return {
    url: FIXTURE_URL,
    path: '/',
    routeName: null,
    scorePerformance: 0.9,
    scoreAccessibility: 0.8,
    scoreSeo: 1,
    scoreBestPractices: 0.95,
    lcp: 1200,
    cls: 0.01,
    inp: null,
    fcp: 1000,
    ttfb: null,
    tbt: 100,
    si: 1500,
    lighthouseVersion: '11.0.0',
    capturedAt: '2025-01-01T00:01:00.000Z',
    scanId: SCAN_ID as ScanRoute['scanId'],
    lhrBlobKey: `scans/${SCAN_ID}/lhr/abc.json.gz`,
  }
}

function makeStubCore(): UnlighthouseCore {
  // The handlers we exercise here never call `core.run()`; if any does, throw.
  return {
    run: () => { throw new Error('core.run not exercised in this test') },
    session: () => null,
  } as unknown as UnlighthouseCore
}

function makeConfig(): UnlighthouseConfig {
  return {
    site: 'https://example.com',
    scanner: { device: 'mobile', throttle: true, samples: 1, maxRoutes: 200 },
    auditor: { name: 'mock' },
  }
}

async function seed(ctx: HandlerCtx): Promise<void> {
  await ctx.storage.scans.create(makeScan())
  await ctx.storage.routes.putBatch(SCAN_ID as never, [makeRoute()])
}

function makeCtx(): HandlerCtx {
  return {
    core: makeStubCore(),
    auditor: createMockAuditor(),
    storage: memoryStorage(),
    config: makeConfig(),
    version: '0.0.0-test',
    auditors: {
      list: () => [{ name: 'mock', ok: true }],
      test: async (name: string) => ({ name, ok: true }),
    },
  }
}

// Stub session for handlers that need an in-flight session.
function stubSession(overrides: Partial<CrawlSession> = {}): CrawlSession {
  return {
    scanId: SCAN_ID as CrawlSession['scanId'],
    events: (async function* () {})(),
    replay: () => [],
    capabilities: { pausable: true },
    pause: async () => {},
    resume: async () => {},
    cancel: async () => {},
    state: () => 'scanning',
    stats: () => ({ discovered: 1, scanned: 1, failed: 0, total: 1 }),
    done: Promise.resolve({ scanId: SCAN_ID as CrawlSession['scanId'], summary: makeScan().summary! }),
    ...overrides,
  } as CrawlSession
}

// ── per-handler smoke inputs ────────────────────────────────────────────────
// Map name → { input, preseed?, expectSession? }. `preseed=false` means run
// against an empty store so we can assert the SCAN_NOT_FOUND throw separately.

interface Case {
  input: unknown
  /** When true (default), seed storage with the fixture scan + route. */
  preseed?: boolean
  /** When set, override ctx.core.session() to return this stub. */
  session?: CrawlSession | null
  /** Skip the smoke test for this command (handled elsewhere). */
  smokeSkip?: boolean
}

const cases: Record<string, Case> = {
  'scan.start': { input: { site: 'https://example.com' }, preseed: false, smokeSkip: true },
  'scan.status': { input: { scanId: SCAN_ID } },
  'scan.cancel': { input: { scanId: SCAN_ID, reason: 'test' }, session: stubSession() },
  'scan.pause': { input: { scanId: SCAN_ID }, session: stubSession() },
  'scan.resume': { input: { scanId: SCAN_ID }, session: stubSession() },
  'scan.delete': { input: { scanId: SCAN_ID } },
  'scan.results': { input: { scanId: SCAN_ID, page: 1, pageSize: 50 } },
  'scan.meta': { input: { scanId: SCAN_ID } },
  'scan.current': { input: {} },
  'scan.rescanAll': { input: { scanId: SCAN_ID }, smokeSkip: true },
  'route.get': { input: { scanId: SCAN_ID, url: FIXTURE_URL } },
  'route.rescan': { input: { scanId: SCAN_ID, url: FIXTURE_URL } },
  'history.list': { input: { page: 1, pageSize: 50 } },
  'history.get': { input: { scanId: SCAN_ID } },
  'history.delete': { input: { scanIds: [SCAN_ID] } },
  'history.rescan': { input: { scanId: SCAN_ID }, smokeSkip: true },
  'compare.run': { input: { baseScanId: SCAN_ID, currentScanId: SCAN_ID } },
  'compare.markdown': { input: { baseScanId: SCAN_ID, currentScanId: SCAN_ID } },
  'compare.findPrevious': { input: { site: 'https://example.com', device: 'mobile' } },
  'assert.evaluate': {
    input: {
      scanId: SCAN_ID,
      assertions: [{ type: 'minScore', category: 'performance', value: 0.5 }],
    },
  },
  'query.routes': { input: { scanId: SCAN_ID, page: 1, pageSize: 50 } },
  'events.subscribe': { input: {}, smokeSkip: true },
  'events.tail': { input: { scanId: SCAN_ID }, smokeSkip: true },
  'manifest': { input: {} },
  'health': { input: {} },
  'auditors.list': { input: {} },
  'auditors.test': { input: { auditor: 'mock', url: FIXTURE_URL } },
}

describe('handlers — smoke', () => {
  const handlers = createHandlers()

  // Streaming + run-spawning commands are covered by dedicated tests in
  // core.test.ts / e2e-scan.test.ts / e2e-http.test.ts; no smoke variant.
  const smokeCases = Object.entries(cases).filter(([, c]) => !c.smokeSkip)
  describe.each(smokeCases)('%s', (name, c) => {

    it('returns output matching the command output schema', async () => {
      const ctx = makeCtx()
      if (c.preseed !== false)
        await seed(ctx)
      if (c.session !== undefined) {
        ;(ctx as any).core = {
          ...ctx.core,
          session: () => c.session,
          run: () => { throw new Error('not exercised') },
        }
      }
      const cmd = (commands as any)[name]
      const handler = (handlers as any)[name]
      const result = await handler.run(c.input, ctx)
      const parsed = cmd.output.safeParse(result)
      if (!parsed.success) {
        // surface the failure for debugging
        throw new Error(`${name} output failed schema:\n${JSON.stringify(parsed.error.issues, null, 2)}\n\nOutput: ${JSON.stringify(result, null, 2)}`)
      }
      expect(parsed.success).toBe(true)
    })
  })
})

describe('handlers — SCAN_NOT_FOUND', () => {
  const handlers = createHandlers()

  // Commands that should throw SCAN_NOT_FOUND when invoked against an empty
  // store with an unknown scanId.
  const notFoundCmds: { name: string, input: any }[] = [
    { name: 'scan.status', input: { scanId: 'missing' } },
    { name: 'scan.delete', input: { scanId: 'missing' } },
    { name: 'scan.results', input: { scanId: 'missing', page: 1, pageSize: 50 } },
    { name: 'scan.meta', input: { scanId: 'missing' } },
    { name: 'scan.rescanAll', input: { scanId: 'missing' } },
    { name: 'route.get', input: { scanId: 'missing', url: FIXTURE_URL } },
    { name: 'route.rescan', input: { scanId: 'missing', url: FIXTURE_URL } },
    { name: 'history.get', input: { scanId: 'missing' } },
    { name: 'history.rescan', input: { scanId: 'missing' } },
    { name: 'compare.run', input: { baseScanId: 'missing', currentScanId: 'missing' } },
    { name: 'assert.evaluate', input: { scanId: 'missing', assertions: [{ type: 'minScore', category: 'performance', value: 0.5 }] } },
  ]

  it.each(notFoundCmds)('$name throws SCAN_NOT_FOUND', async ({ name, input }) => {
    const ctx = makeCtx() // empty store
    const handler = (createHandlers() as any)[name]
    void handlers // satisfy linter
    await expect(handler.run(input, ctx)).rejects.toMatchObject({
      code: 'SCAN_NOT_FOUND',
    })
    // Also assert it's an UnlighthouseError instance.
    await handler.run(input, ctx).catch((err: unknown) => {
      expect(err).toBeInstanceOf(UnlighthouseError)
    })
  })
})

describe('handlers — streaming', () => {
  const handlers = createHandlers()

  it('events.subscribe returns an AsyncIterable that closes cleanly with no session', async () => {
    const ctx = makeCtx()
    const result = handlers['events.subscribe'].run({} as never, ctx) as AsyncIterable<unknown>
    expect(typeof (result as any)[Symbol.asyncIterator]).toBe('function')
    const collected: unknown[] = []
    for await (const item of result)
      collected.push(item)
    expect(collected).toEqual([])
  })

  it('events.tail with no persisted blob iterates empty cleanly', async () => {
    const ctx = makeCtx()
    const result = handlers['events.tail'].run({ scanId: SCAN_ID as never }, ctx) as AsyncIterable<unknown>
    expect(typeof (result as any)[Symbol.asyncIterator]).toBe('function')
    const collected: unknown[] = []
    for await (const item of result)
      collected.push(item)
    expect(collected).toEqual([])
  })

  it('events.tail yields persisted events from a gzipped blob', async () => {
    const ctx = makeCtx()
    const lines = [
      JSON.stringify({ event: 'route:complete', scanId: SCAN_ID, payload: { url: FIXTURE_URL } }),
      JSON.stringify({ event: 'scan:complete', scanId: SCAN_ID, payload: {} }),
    ].join('\n')
    const gz = gzipSync(Buffer.from(lines, 'utf-8'))
    await ctx.storage.blobs.put(`scans/${SCAN_ID}/events.jsonl.gz`, new Uint8Array(gz))
    const iter = handlers['events.tail'].run({ scanId: SCAN_ID as never }, ctx) as AsyncIterable<any>
    const out: any[] = []
    for await (const item of iter)
      out.push(item)
    expect(out.length).toBe(2)
    expect(out[0].event).toBe('route:complete')
  })
})

describe('handlers — scan.start / scan.rescanAll / history.rescan', () => {
  it('scan.start throws ACTIVE_SCAN_CONFLICT when a session is in flight', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    ;(ctx as any).core.session = () => stubSession()
    await expect(handlers['scan.start'].run({ site: 'https://example.com' } as never, ctx))
      .rejects.toMatchObject({ code: 'ACTIVE_SCAN_CONFLICT' })
  })

  it('scan.start calls core.run() and returns a shape matching the output schema', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    let runCalled = 0
    ;(ctx as any).core = {
      session: () => null,
      run: () => {
        runCalled++
        return stubSession({ scanId: 'newscan' as CrawlSession['scanId'] })
      },
    }
    const result = await handlers['scan.start'].run({ site: 'https://example.com' } as never, ctx) as any
    expect(runCalled).toBe(1)
    const parsed = commands['scan.start'].output.safeParse(result)
    expect(parsed.success).toBe(true)
    expect(result.scanId).toBe('newscan')
  })

  it('scan.rescanAll throws ACTIVE_SCAN_CONFLICT when a session is in flight', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    await seed(ctx)
    ;(ctx as any).core.session = () => stubSession()
    await expect(handlers['scan.rescanAll'].run({ scanId: SCAN_ID as never }, ctx))
      .rejects.toMatchObject({ code: 'ACTIVE_SCAN_CONFLICT' })
  })

  it('scan.rescanAll drops routes and calls core.run()', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    await seed(ctx)
    let runCalled = 0
    ;(ctx as any).core = {
      session: () => null,
      run: () => { runCalled++; return stubSession() },
    }
    const result = await handlers['scan.rescanAll'].run({ scanId: SCAN_ID as never }, ctx) as any
    expect(runCalled).toBe(1)
    const parsed = commands['scan.rescanAll'].output.safeParse(result)
    expect(parsed.success).toBe(true)
    const remaining = await ctx.storage.routes.listForScan(SCAN_ID as never, { page: 1, pageSize: 10 })
    expect(remaining.items.length).toBe(0)
  })

  it('history.rescan calls core.run() and returns sourceScanId', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    await seed(ctx)
    let runCalled = 0
    ;(ctx as any).core = {
      session: () => null,
      run: () => { runCalled++; return stubSession({ scanId: 'cloned' as CrawlSession['scanId'] }) },
    }
    const result = await handlers['history.rescan'].run({ scanId: SCAN_ID as never }, ctx) as any
    expect(runCalled).toBe(1)
    expect(result.sourceScanId).toBe(SCAN_ID)
    const parsed = commands['history.rescan'].output.safeParse(result)
    expect(parsed.success).toBe(true)
  })
})

// quiet unused-import warnings if any path drops the import
void OTHER_SCAN_ID
