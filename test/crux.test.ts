import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkBudgets } from '../src/analysis/budgets.ts'
import { toMarkdown } from '../src/analysis/markdown.ts'
import { budgetsSchema } from '../src/config.ts'
import type { Store } from '../src/contracts.ts'
import { openStore } from '../src/db/index.ts'
import { EventBus } from '../src/events.ts'
import type { UnlighthouseEvent } from '../src/events.ts'
import { collectField } from '../src/field/crux.ts'
import { analyzeScan } from '../src/ops/analysis.ts'
import { operations } from '../src/ops/operations.ts'
import { invoke } from '../src/ops/registry.ts'
import { createScanner } from '../src/scan/runner.ts'
import type { Scanner } from '../src/scan/runner.ts'
import { createFakePool } from './fixtures/fake-pool.ts'
import { servePages } from './fixtures/pages.ts'

const SITE = 'https://shop.example'

interface CruxRequest {
  method: string
  key: string | null
  body: { url?: string, origin?: string, formFactor?: string, metrics?: string[], collectionPeriodCount?: number }
}

function metric(p75: number | string, good: number, ni: number, poor: number) {
  return {
    histogram: [{ start: 0, end: 1, density: good }, { start: 1, end: 2, density: ni }, { start: 2, density: poor }],
    percentiles: { p75 },
  }
}

function record(key: Record<string, string>, formFactor: string, lcp: number) {
  return {
    record: {
      key: { ...key, formFactor },
      metrics: {
        largest_contentful_paint: metric(lcp, 0.81234, 0.1, 0.08766),
        interaction_to_next_paint: metric(180, 0.8, 0.15, 0.05),
        cumulative_layout_shift: metric('0.05', 0.9, 0.06, 0.04),
        first_contentful_paint: metric(1500, 0.7, 0.2, 0.1),
        experimental_time_to_first_byte: metric(700, 0.6, 0.3, 0.1),
      },
      collectionPeriod: { firstDate: { year: 2026, month: 9, day: 4 }, lastDate: { year: 2026, month: 10, day: 1 } },
    },
  }
}

interface FakeCrux {
  url: string
  requests: CruxRequest[]
  mode: 'normal' | 'quota' | 'error'
  throttleOnce: Set<string>
  stop(): void
}

function serveCrux(origin: string): FakeCrux {
  const fake: FakeCrux = { url: '', requests: [], mode: 'normal', throttleOnce: new Set(), stop: () => {} }
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url)
      const body = await request.json() as CruxRequest['body']
      fake.requests.push({ method: url.pathname, key: url.searchParams.get('key'), body })
      if (fake.mode === 'quota')
        return Response.json({ error: { code: 429 } }, { status: 429, headers: { 'retry-after': '0' } })
      if (fake.mode === 'error')
        return Response.json({ error: { code: 500 } }, { status: 500 })
      const target = body.url ?? body.origin ?? ''
      if (fake.throttleOnce.delete(target))
        return Response.json({ error: { code: 429 } }, { status: 429, headers: { 'retry-after': '0' } })
      const formFactor = body.formFactor ?? ''
      if (url.pathname.endsWith('records:queryHistoryRecord')) {
        return Response.json({
          record: {
            key: { origin: body.origin, formFactor },
            metrics: { largest_contentful_paint: { histogramTimeseries: [], percentilesTimeseries: { p75s: [2600, null, 2400] } } },
            collectionPeriods: [1, 2, 3].map(week => ({ firstDate: { year: 2026, month: 9, day: week }, lastDate: { year: 2026, month: 9, day: week + 27 } })),
          },
        })
      }
      if (body.origin === origin)
        return Response.json(record({ origin }, formFactor, formFactor === 'PHONE' ? 2900 : 1900))
      if (body.url === `${origin}/` && formFactor === 'PHONE')
        return Response.json(record({ url: body.url }, formFactor, 3100))
      return Response.json({ error: { code: 404, message: 'chrome ux report data not found', status: 'NOT_FOUND' } }, { status: 404 })
    },
  })
  fake.url = `http://127.0.0.1:${server.port}/v1`
  fake.stop = () => server.stop(true)
  return fake
}

let dir: string
let store: Store
let crux: FakeCrux

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unlighthouse-crux-'))
  store = openStore(join(dir, 'data'))
  crux = serveCrux(SITE)
})

afterEach(() => {
  crux.stop()
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

const pages = [
  { url: `${SITE}/`, device: 'mobile' as const },
  { url: `${SITE}/about`, device: 'mobile' as const },
  { url: `${SITE}/`, device: 'desktop' as const },
]

describe('collectField', () => {
  test('queries URL then origin per form factor and parses p75 and histograms', async () => {
    const field = await collectField({ origin: SITE, devices: ['mobile', 'desktop'], pages }, { apiKey: 'k&y', store, baseUrl: crux.url })
    expect(crux.requests.every(request => request.key === 'k&y')).toBe(true)
    expect(crux.requests.filter(request => request.body.origin).map(request => request.body.formFactor)).toEqual(['PHONE', 'DESKTOP'])
    expect(crux.requests[0]!.body.metrics).toEqual(['largest_contentful_paint', 'interaction_to_next_paint', 'cumulative_layout_shift', 'first_contentful_paint', 'experimental_time_to_first_byte'])
    expect(field.origin.mobile).toEqual({
      key: SITE,
      formFactor: 'PHONE',
      metrics: {
        lcp: { p75: 2900, histogram: { good: 0.8123, needsImprovement: 0.1, poor: 0.0877 } },
        inp: { p75: 180, histogram: { good: 0.8, needsImprovement: 0.15, poor: 0.05 } },
        cls: { p75: 0.05, histogram: { good: 0.9, needsImprovement: 0.06, poor: 0.04 } },
        fcp: { p75: 1500, histogram: { good: 0.7, needsImprovement: 0.2, poor: 0.1 } },
        ttfb: { p75: 700, histogram: { good: 0.6, needsImprovement: 0.3, poor: 0.1 } },
      },
      period: { first: '2026-09-04', last: '2026-10-01' },
    })
    const byKey = Object.fromEntries(field.pages.map(page => [`${page.device} ${page.url}`, page]))
    expect(byKey[`mobile ${SITE}/`]).toMatchObject({ source: 'url', record: { key: `${SITE}/`, metrics: { lcp: { p75: 3100 } } } })
    expect(byKey[`mobile ${SITE}/about`]).toMatchObject({ source: 'origin', record: { key: SITE } })
    expect(byKey[`desktop ${SITE}/`]).toMatchObject({ source: 'origin', record: { formFactor: 'DESKTOP', metrics: { lcp: { p75: 1900 } } } })
  })

  test('caches answers, including not-found, for 24 hours', async () => {
    await collectField({ origin: SITE, devices: ['mobile', 'desktop'], pages }, { apiKey: 'k', store, baseUrl: crux.url })
    const first = crux.requests.length
    expect(first).toBe(5)
    const again = await collectField({ origin: SITE, devices: ['mobile', 'desktop'], pages }, { apiKey: 'k', store, baseUrl: crux.url })
    expect(crux.requests.length).toBe(first)
    expect(again.pages.find(page => page.url.endsWith('/about'))!.source).toBe('origin')
  })

  test('backs off and retries on 429, and stops querying once the quota stays exhausted', async () => {
    crux.throttleOnce.add(SITE)
    const retried = await collectField({ origin: SITE, devices: ['mobile'], pages: [] }, { apiKey: 'k', store, baseUrl: crux.url, backoffMs: 1 })
    expect(retried.origin.mobile?.metrics.lcp?.p75).toBe(2900)
    expect(crux.requests.length).toBe(2)

    const fresh = openStore(join(dir, 'other'))
    crux.mode = 'quota'
    crux.requests.length = 0
    const warnings: string[] = []
    const exhausted = await collectField({ origin: SITE, devices: ['mobile', 'desktop'], pages }, { apiKey: 'k', store: fresh, baseUrl: crux.url, backoffMs: 1, maxRetries: 2, onWarn: message => warnings.push(message) })
    fresh.close()
    expect(crux.requests.length).toBe(3)
    expect(exhausted.origin).toEqual({ mobile: null, desktop: null })
    expect(exhausted.pages.every(page => page.source === null)).toBe(true)
    expect(warnings).toEqual(['CrUX API quota exhausted (HTTP 429); remaining field data was skipped'])
  })

  test('gives up on a CrUX API that never answers instead of hanging the scan', async () => {
    const silent = Bun.serve({ port: 0, hostname: '127.0.0.1', idleTimeout: 0, fetch: () => new Promise<Response>(() => {}) })
    try {
      const warnings: string[] = []
      const started = Date.now()
      const field = await collectField({ origin: SITE, devices: ['mobile', 'desktop'], pages }, { apiKey: 'k', store, baseUrl: `http://127.0.0.1:${silent.port}/v1`, timeoutMs: 300, onWarn: message => warnings.push(message) })
      expect(Date.now() - started).toBeLessThan(3_000)
      expect(field.origin).toEqual({ mobile: null, desktop: null })
      expect(warnings).toEqual(['CrUX API did not answer within 300 ms; remaining field data was skipped'])
    }
    finally {
      silent.stop(true)
    }
  })

  test('fetches the origin trend from the History API when asked', async () => {
    const field = await collectField({ origin: SITE, devices: ['mobile'], pages: [], history: true }, { apiKey: 'k', store, baseUrl: crux.url })
    const history = crux.requests.find(request => request.method.endsWith('records:queryHistoryRecord'))!
    expect(history.body).toMatchObject({ origin: SITE, formFactor: 'PHONE', collectionPeriodCount: 25 })
    expect(field.origin.mobile!.trend).toEqual({ periods: ['2026-09-28', '2026-09-29', '2026-09-30'], p75: { lcp: [2600, null, 2400] } })
  })
})

describe('field data in a scan', () => {
  const site = servePages(['/', '/about'])
  const scanners: Scanner[] = []
  afterAll(() => site.stop())
  afterEach(async () => {
    for (const scanner of scanners.splice(0))
      await scanner.close()
  })

  function scanner(env: Record<string, string>) {
    const bus = new EventBus()
    const events: UnlighthouseEvent[] = []
    bus.on(event => events.push(event))
    const instance = createScanner({ store, bus, createPool: createFakePool().createPool, cpus: 12, env, crux: { baseUrl: crux.url, backoffMs: 1, maxRetries: 1 } })
    scanners.push(instance)
    return { instance, events }
  }

  async function scan(env: Record<string, string>, mode: FakeCrux['mode'] = 'normal') {
    const fake = serveCrux(site.origin)
    fake.mode = mode
    crux.stop()
    crux = fake
    const { instance, events } = scanner(env)
    const started = instance.start({ site: site.origin, devices: ['mobile', 'desktop'], crux: { enabled: true, apiKeyEnv: 'TEST_CRUX_KEY' } })
    const done = await instance.wait(started.id, 10_000)
    return { done, events, ctx: { store, scanner: instance } }
  }

  test('stores field data per page and device and exposes it in pages.get, scans.field, the summary and budgets', async () => {
    const { done, ctx } = await scan({ TEST_CRUX_KEY: 'secret' })
    expect(done.status).toBe('done')
    const home = await invoke(operations, ctx, 'pages.get', { scanId: done.id, url: `${site.origin}/`, device: 'mobile' }) as { field: unknown }
    expect(home.field).toMatchObject({ source: 'url', record: { key: `${site.origin}/`, metrics: { lcp: { p75: 3100 } } } })
    const about = await invoke(operations, ctx, 'pages.get', { scanId: done.id, url: `${site.origin}/about`, device: 'desktop' }) as { field: unknown }
    expect(about.field).toMatchObject({ source: 'origin', record: { key: site.origin, formFactor: 'DESKTOP' } })

    const field = await invoke(operations, ctx, 'scans.field', { scanId: done.id }) as Record<string, any>
    expect(field['origin'].mobile.metrics.inp.p75).toBe(180)
    expect(field['coverage']).toEqual({ desktop: { url: 0, origin: 2, none: 0 }, mobile: { url: 1, origin: 1, none: 0 } })
    expect(field['pages']).toHaveLength(4)

    const analysis = analyzeScan(store, done.id)
    const mobile = analysis.summary.devices.find(device => device.device === 'mobile')!
    expect(mobile.field).toEqual({ p75: { lcp: 2900, inp: 180, cls: 0.05, fcp: 1500, ttfb: 700 }, period: '2026-09-04/2026-10-01', coverage: { url: 1, origin: 1, none: 0 } })
    expect(mobile.p75.lcp).toBe(1800)
    expect(analysis.summary.fieldNote).toContain('not expected to match')

    const report = checkBudgets({ summary: analysis.summary, pages: analysis.side.pages }, budgetsSchema.parse({ field: { lcp: 2500, inp: 200 } }))
    expect(report.results).toEqual([
      { rule: 'field:lcp', scope: 'mobile', actual: 2900, limit: 2500, passed: false, detail: 'CrUX origin p75' },
      { rule: 'field:lcp', scope: 'desktop', actual: 1900, limit: 2500, passed: true, detail: 'CrUX origin p75' },
      { rule: 'field:inp', scope: 'mobile', actual: 180, limit: 200, passed: true, detail: 'CrUX origin p75' },
      { rule: 'field:inp', scope: 'desktop', actual: 180, limit: 200, passed: true, detail: 'CrUX origin p75' },
    ])
    expect(toMarkdown({ summary: analysis.summary })).toContain('- mobile: LCP 2.9 s · INP 180 ms · CLS 0.05 · FCP 1.5 s · TTFB 700 ms')
  })

  test('never fails the scan when CrUX fails or the key is missing', async () => {
    const failing = await scan({ TEST_CRUX_KEY: 'secret' }, 'error')
    expect(failing.done.status).toBe('done')
    expect(crux.requests.length).toBeGreaterThan(0)
    expect(failing.events.some(event => event.type === 'log' && event.level === 'warn' && event.message.includes('HTTP 500'))).toBe(true)
    expect(JSON.stringify(failing.events)).not.toContain('secret')

    const missing = await scan({})
    expect(missing.done.status).toBe('done')
    expect(missing.events.some(event => event.type === 'log' && event.message.includes('TEST_CRUX_KEY is empty'))).toBe(true)
    expect(await invoke(operations, missing.ctx, 'scans.field', { scanId: missing.done.id })).toBeNull()
    expect(await invoke(operations, missing.ctx, 'pages.get', { scanId: missing.done.id, url: `${site.origin}/`, device: 'mobile' })).toMatchObject({ field: null })
    const summary = analyzeScan(store, missing.done.id).summary
    expect(summary.fieldNote).toBeUndefined()
    expect(checkBudgets({ summary, pages: [] }, budgetsSchema.parse({ field: { lcp: 2500 } })).results[0]).toMatchObject({ skipped: true, detail: 'no field data' })
  })
})
