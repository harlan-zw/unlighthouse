// Unit tests for the handler set: each handler runs against a fixture ctx
// (memory storage + mock auditor + stub core). We verify output shape via
// the command's Zod `output.safeParse` rather than strict equality.

import type { CrawlSession, UnlighthouseCore, UnlighthouseCoreRunOptions } from '@unlighthouse/contracts'
import type { CommandInput, CommandName, CommandRegistry } from '@unlighthouse/contracts/commands'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { Scan, ScanId, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { gzipSync } from 'node:zlib'
import { commands } from '@unlighthouse/contracts/commands'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'
import { testConfig, testScanId, testUrl } from './helpers/contracts'

// ── fixtures ────────────────────────────────────────────────────────────────

const SCAN_ID = testScanId('scan-fixture-0001')
const OTHER_SCAN_ID = testScanId('scan-fixture-0002')
const NEW_SCAN_ID = testScanId('newscan')
const CLONED_SCAN_ID = testScanId('cloned')
const MISSING_SCAN_ID = testScanId('missing')
const FIXTURE_URL = testUrl('https://example.com/')

function makeScan(id: ScanId = SCAN_ID): Scan {
  return {
    scanId: id,
    siteId: 'https://example.com',
    site: testUrl('https://example.com'),
    mode: 'site',
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
    scanId: SCAN_ID,
    device: 'mobile',
    lhrBlobKey: `scans/${SCAN_ID}/lhr/abc.json.gz`,
  }
}

function makeCore(overrides: Partial<UnlighthouseCore> = {}): UnlighthouseCore {
  return {
    run: () => { throw new Error('core.run not exercised in this test') },
    session: () => null,
    hooks: undefined,
    ...overrides,
  }
}

function makeStubCore(): UnlighthouseCore {
  // The handlers we exercise here never call `core.run()`; if any does, throw.
  return makeCore()
}

function makeConfig(): UnlighthouseConfig {
  return testConfig({
    site: 'https://example.com',
    scanner: { device: 'mobile', throttle: true, samples: 1, maxRoutes: 200 },
    auditor: { name: 'mock' },
  })
}

async function seed(ctx: HandlerCtx): Promise<void> {
  await ctx.storage.scans.create(makeScan())
  await ctx.storage.routes.putBatch(SCAN_ID, 'mobile', [makeRoute()])
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
    scanId: SCAN_ID,
    events: (async function* () {})(),
    replay: () => [],
    capabilities: { pausable: true },
    pause: async () => {},
    resume: async () => {},
    cancel: async () => {},
    state: () => 'scanning',
    stats: () => ({ discovered: 1, scanned: 1, failed: 0, total: 1 }),
    done: Promise.resolve({ scanId: SCAN_ID, summary: makeScan().summary! }),
    ...overrides,
  } as CrawlSession
}

// ── per-handler smoke inputs ────────────────────────────────────────────────
// Map name → { input, preseed?, expectSession? }. `preseed=false` means run
// against an empty store so we can assert the SCAN_NOT_FOUND throw separately.

interface Case {
  input: CommandInput<CommandRegistry[CommandName]>
  /** When true (default), seed storage with the fixture scan + route. */
  preseed?: boolean
  /** When set, override ctx.core.session() to return this stub. */
  session?: CrawlSession
  /** Skip the smoke test for this command (handled elsewhere). */
  smokeSkip?: boolean
}

const cases: Partial<Record<CommandName, Case>> = {
  'scan.start': { input: { site: FIXTURE_URL }, preseed: false, smokeSkip: true },
  'scan.status': { input: { scanId: SCAN_ID } },
  'scan.cancel': { input: { scanId: SCAN_ID, reason: 'test' }, session: stubSession() },
  'scan.pause': { input: { scanId: SCAN_ID }, session: stubSession() },
  'scan.resume': { input: { scanId: SCAN_ID }, session: stubSession() },
  'scan.delete': { input: { scanId: SCAN_ID } },
  'scan.results': { input: { scanId: SCAN_ID, page: 1, pageSize: 50 } },
  'scan.meta': { input: { scanId: SCAN_ID } },
  'scan.current': { input: {} },
  'scan.rescanAll': { input: { scanId: SCAN_ID }, smokeSkip: true },
  'route.rescan': { input: { scanId: SCAN_ID, url: FIXTURE_URL } },
  'history.list': { input: { page: 1, pageSize: 50 } },
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
}

describe('handlers — smoke', () => {
  const handlers = createHandlers()

  // Streaming + run-spawning commands are covered by dedicated tests in
  // core.test.ts / e2e-scan.test.ts / e2e-http.test.ts; no smoke variant.
  const smokeCases = Object.entries(cases).filter(([, c]) => !c.smokeSkip) as Array<[CommandName, Case]>
  describe.each(smokeCases)('%s', (name, c) => {

    it('returns output matching the command output schema', async () => {
      const ctx = makeCtx()
      if (c.preseed !== false)
        await seed(ctx)
      if (c.session !== undefined) {
        ctx.core = makeCore({
          session: () => c.session,
          run: () => { throw new Error('not exercised') },
        })
      }
      const cmd = commands[name]
      const handler = handlers[name]
      const result = await handler.run(c.input as CommandInput<CommandRegistry[typeof name]>, ctx)
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
  const notFoundCmds: Array<{ name: CommandName, input: unknown }> = [
    { name: 'scan.status', input: { scanId: MISSING_SCAN_ID } },
    { name: 'scan.delete', input: { scanId: MISSING_SCAN_ID } },
    { name: 'scan.results', input: { scanId: MISSING_SCAN_ID, page: 1, pageSize: 50 } },
    { name: 'scan.meta', input: { scanId: MISSING_SCAN_ID } },
    { name: 'scan.rescanAll', input: { scanId: MISSING_SCAN_ID } },
    { name: 'route.rescan', input: { scanId: MISSING_SCAN_ID, url: FIXTURE_URL } },
    { name: 'history.rescan', input: { scanId: MISSING_SCAN_ID } },
    { name: 'compare.run', input: { baseScanId: MISSING_SCAN_ID, currentScanId: MISSING_SCAN_ID } },
    { name: 'assert.evaluate', input: { scanId: MISSING_SCAN_ID, assertions: [{ type: 'minScore', category: 'performance', value: 0.5 }] } },
  ]

  it.each(notFoundCmds)('$name throws SCAN_NOT_FOUND', async ({ name, input }) => {
    const ctx = makeCtx() // empty store
    const handler = createHandlers()[name]
    void handlers // satisfy linter
    await expect(handler.run(input as CommandInput<CommandRegistry[typeof name]>, ctx)).rejects.toMatchObject({
      code: 'SCAN_NOT_FOUND',
    })
    // Also assert it's an UnlighthouseError instance.
    await handler.run(input as CommandInput<CommandRegistry[typeof name]>, ctx).catch((err: unknown) => {
      expect(err).toBeInstanceOf(UnlighthouseError)
    })
  })
})

describe('handlers — streaming', () => {
  const handlers = createHandlers()

  it('events.subscribe returns an AsyncIterable that closes cleanly with no session', async () => {
    const ctx = makeCtx()
    const result = handlers['events.subscribe'].run({}, ctx) as AsyncIterable<unknown>
    expect(typeof result[Symbol.asyncIterator]).toBe('function')
    const collected: unknown[] = []
    for await (const item of result)
      collected.push(item)
    expect(collected).toEqual([])
  })

  it('events.tail with no persisted blob iterates empty cleanly', async () => {
    const ctx = makeCtx()
    const result = handlers['events.tail'].run({ scanId: SCAN_ID }, ctx) as AsyncIterable<unknown>
    expect(typeof result[Symbol.asyncIterator]).toBe('function')
    const collected: unknown[] = []
    for await (const item of result)
      collected.push(item)
    expect(collected).toEqual([])
  })

  it('events.tail yields persisted events from a gzipped blob', async () => {
    const ctx = makeCtx()
    const lines = [
      JSON.stringify({ event: 'scan:started', payload: { scanId: SCAN_ID } }),
      JSON.stringify({ event: 'scan:complete', payload: { scanId: SCAN_ID, summary: makeScan().summary } }),
    ].join('\n')
    const gz = gzipSync(Buffer.from(lines, 'utf-8'))
    await ctx.storage.blobs.put(`scans/${SCAN_ID}/events.jsonl.gz`, new Uint8Array(gz))
    const iter = handlers['events.tail'].run({ scanId: SCAN_ID }, ctx) as AsyncIterable<{ event: string }>
    const out: Array<{ event: string }> = []
    for await (const item of iter)
      out.push(item)
    expect(out.length).toBe(2)
    expect(out[0].event).toBe('scan:started')
  })
})

describe('handlers — scan.start / scan.rescanAll / history.rescan', () => {
  it('scan.start throws ACTIVE_SCAN_CONFLICT when a session is in flight', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    ctx.core = makeCore({ session: () => stubSession() })
    await expect(handlers['scan.start'].run({ site: FIXTURE_URL }, ctx))
      .rejects.toMatchObject({ code: 'ACTIVE_SCAN_CONFLICT' })
  })

  it('scan.start calls core.run() and returns a shape matching the output schema', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    let runCalled = 0
    ctx.core = makeCore({
      session: () => null,
      run: () => {
        runCalled++
        return stubSession({ scanId: NEW_SCAN_ID })
      },
    })
    const result = await handlers['scan.start'].run({ site: FIXTURE_URL }, ctx)
    expect(runCalled).toBe(1)
    const parsed = commands['scan.start'].output.safeParse(result)
    expect(parsed.success).toBe(true)
    expect(commands['scan.start'].output.parse(result).scanId).toBe('newscan')
  })

  it('scan.start threads input (site/device/categories/sampleSize/auditor/ciBuild) into core.run(overrides)', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    let receivedOpts: UnlighthouseCoreRunOptions | undefined
    ctx.core = makeCore({
      session: () => null,
      run: (opts?: UnlighthouseCoreRunOptions) => {
        receivedOpts = opts
        return stubSession({ scanId: NEW_SCAN_ID })
      },
    })
    await handlers['scan.start'].run({
      site: FIXTURE_URL,
      device: 'desktop',
      sampleSize: 3,
      categories: ['performance', 'seo'],
      auditor: 'psi',
      ciBuild: { branch: 'main', hash: 'abc123', message: 'release' },
    }, ctx)
    expect(receivedOpts?.overrides).toEqual({
      site: FIXTURE_URL,
      device: 'desktop',
      sampleSize: 3,
      categories: ['performance', 'seo'],
      auditor: 'psi',
      ciBuild: { branch: 'main', hash: 'abc123', message: 'release' },
    })
  })

  it('scan.rescanAll throws ACTIVE_SCAN_CONFLICT when a session is in flight', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    await seed(ctx)
    ctx.core = makeCore({ session: () => stubSession() })
    await expect(handlers['scan.rescanAll'].run({ scanId: SCAN_ID }, ctx))
      .rejects.toMatchObject({ code: 'ACTIVE_SCAN_CONFLICT' })
  })

  it('scan.rescanAll drops routes and calls core.run()', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    await seed(ctx)
    let runCalled = 0
    ctx.core = makeCore({
      session: () => null,
      run: () => { runCalled++; return stubSession() },
    })
    const result = await handlers['scan.rescanAll'].run({ scanId: SCAN_ID }, ctx)
    expect(runCalled).toBe(1)
    const parsed = commands['scan.rescanAll'].output.safeParse(result)
    expect(parsed.success).toBe(true)
    const remaining = await ctx.storage.routes.listForScan(SCAN_ID, { page: 1, pageSize: 10 })
    expect(remaining.items.length).toBe(0)
  })

  it('history.rescan calls core.run() and returns sourceScanId', async () => {
    const handlers = createHandlers()
    const ctx = makeCtx()
    await seed(ctx)
    let runCalled = 0
    ctx.core = makeCore({
      session: () => null,
      run: () => { runCalled++; return stubSession({ scanId: CLONED_SCAN_ID }) },
    })
    const result = await handlers['history.rescan'].run({ scanId: SCAN_ID }, ctx)
    expect(runCalled).toBe(1)
    expect(commands['history.rescan'].output.parse(result).sourceScanId).toBe(SCAN_ID)
    const parsed = commands['history.rescan'].output.safeParse(result)
    expect(parsed.success).toBe(true)
  })
})

// quiet unused-import warnings if any path drops the import
void OTHER_SCAN_ID
