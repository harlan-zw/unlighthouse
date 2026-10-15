import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'
import type { UnlighthouseEvent } from '../src/events.ts'
import { CATEGORIES, DEVICES, METRICS } from '../src/types.ts'
import { ApiError } from '../src/ui/api.ts'
import { createMockClient, type MockClient } from '../src/ui/mock.ts'

const device = z.enum(DEVICES)
const category = z.enum(CATEGORIES)
const scanStatus = z.enum(['queued', 'discovering', 'auditing', 'done', 'cancelled', 'failed'])
const pageStatus = z.enum(['queued', 'running', 'done', 'failed', 'skipped'])
const severity = z.enum(['fail', 'warn'])
const score = z.number().min(0).max(1).nullable()
const scores = z.strictObject(Object.fromEntries(CATEGORIES.map(c => [c, score])) as Record<typeof CATEGORIES[number], typeof score>)
const metricValue = z.number().min(0).nullable()
const metrics = z.strictObject(Object.fromEntries(METRICS.map(m => [m, metricValue])) as Record<typeof METRICS[number], typeof metricValue>)
const timestamp = z.number().int().positive()

const stats = z.strictObject({ discovered: z.number().int().min(0), queued: z.number().int().min(0), done: z.number().int().min(0), failed: z.number().int().min(0), skipped: z.number().int().min(0) })
const scan = z.strictObject({
  id: z.string().min(1),
  siteId: z.number().int(),
  origin: z.url(),
  status: scanStatus,
  label: z.string().nullable(),
  branch: z.string().nullable(),
  commit: z.string().nullable(),
  devices: z.array(device).min(1),
  options: z.unknown(),
  stats,
  lighthouseVersion: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: timestamp,
  startedAt: timestamp.nullable(),
  finishedAt: timestamp.nullable(),
})
const provenance = z.strictObject({
  lighthouseVersion: z.string(),
  benchmarkIndex: z.number().nullable(),
  throttling: z.string(),
  concurrency: z.number().int().min(1),
  samples: z.number().int().min(1),
  spread: z.number().min(0).nullable(),
  warnings: z.array(z.string()),
})
const page = z.strictObject({
  scanId: z.string(),
  url: z.url(),
  path: z.string().startsWith('/'),
  template: z.string(),
  device,
  status: pageStatus,
  scores,
  metrics,
  finalUrl: z.string().nullable(),
  statusCode: z.number().int().nullable(),
  provenance: provenance.nullable(),
  error: z.string().nullable(),
  durationMs: z.number().nullable(),
  finishedAt: timestamp.nullable(),
})
const finding = z.strictObject({
  auditId: z.string(),
  category: category.nullable(),
  title: z.string(),
  severity,
  score: score,
  displayValue: z.string().nullable(),
  itemKey: z.string(),
  itemLabel: z.string().nullable(),
  savingsMs: z.number().nullable(),
  savingsBytes: z.number().nullable(),
})
const issue = z.strictObject({
  auditId: z.string(),
  category: category.nullable(),
  title: z.string(),
  itemKey: z.string(),
  itemLabel: z.string().nullable(),
  severity,
  pages: z.number().int().min(1),
  devices: z.array(device).min(1),
  templates: z.array(z.string()).min(1),
  savingsMs: z.number().min(0),
  savingsBytes: z.number().min(0),
  impact: z.number().min(0),
  examples: z.array(z.url()),
})
const issuePage = z.strictObject({ url: z.url(), device, template: z.string(), savingsMs: z.number().nullable(), savingsBytes: z.number().nullable(), displayValue: z.string().nullable() })
const paged = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item), total: z.number().int().min(0) })
const site = z.strictObject({ id: z.number().int(), origin: z.url(), createdAt: timestamp, scans: z.number().int().min(0), lastScan: scan.nullable(), lastScores: z.partialRecord(device, scores) })
const brokenLink = z.strictObject({ url: z.url(), status: z.number().int(), from: z.url() })
const event = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('scan:status'), scanId: z.string(), status: scanStatus, error: z.string().optional() }),
  z.strictObject({ type: z.literal('scan:progress'), scanId: z.string(), discovered: z.number(), queued: z.number(), done: z.number(), failed: z.number(), skipped: z.number() }),
  z.strictObject({ type: z.literal('page:discovered'), scanId: z.string(), url: z.url(), template: z.string() }),
  z.strictObject({ type: z.literal('page:status'), scanId: z.string(), url: z.url(), device, status: pageStatus, score: score.optional(), error: z.string().optional() }),
  z.strictObject({ type: z.literal('log'), scanId: z.string().optional(), level: z.enum(['info', 'warn', 'error']), message: z.string() }),
])

let client: MockClient
afterEach(() => client?.dispose())

describe('mock client', () => {
  test('every read operation returns data shaped like the shared types', async () => {
    client = createMockClient({ latency: 0, tickMs: 0 })
    const sites = z.array(site).parse(await client.call('sites.list', {}))
    expect(sites.length).toBeGreaterThanOrEqual(3)

    const scans = paged(scan).parse(await client.call('scans.list', { limit: 100, offset: 0 }))
    expect(scans.items.map(s => s.status)).toEqual(expect.arrayContaining(['done', 'auditing', 'failed']))
    const done = scans.items.find(s => s.status === 'done' && s.devices.length === 2)
    expect(done).toBeDefined()
    const id = done!.id

    scan.parse(await client.call('scans.get', { scanId: id }))
    const sum = await client.call('scans.summary', { scanId: id })
    expect(sum.pages.discovered).toBe(300)
    expect(sum.pages.audited + sum.pages.skippedBySampling).toBe(300)
    expect(sum.devices.map(d => d.device)).toEqual(['mobile', 'desktop'])
    expect(sum.siteChecks['llms-txt']).toBe('fail')
    expect(sum.baseline?.scanId).toBeDefined()
    z.array(brokenLink).parse(await client.call('scans.brokenLinks', { scanId: id }))

    const pages = paged(page).parse(await client.call('pages.list', { scanId: id, limit: 1000, offset: 0 }))
    expect(pages.total).toBe(600)
    const audited = pages.items.find(p => p.status === 'done')!
    const detail = page.extend({ findings: z.array(finding) }).parse(await client.call('pages.get', { scanId: id, url: audited.url, device: audited.device }))
    expect(detail.provenance).not.toBeNull()

    const issues = paged(issue).parse(await client.call('issues.list', { scanId: id, limit: 50, offset: 0 }))
    const first = issues.items[0]!
    const one = z.strictObject({ issue, pages: z.array(issuePage) }).parse(await client.call('issues.get', { scanId: id, auditId: first.auditId, itemKey: first.itemKey }))
    expect(one.pages.length).toBe(new Set(one.pages.map(p => `${p.url}|${p.device}`)).size)

    const shop = scans.items.filter(s => s.origin === done!.origin && s.status === 'done')
    const diff = await client.call('compare', { base: shop[1]!.id, head: shop[0]!.id })
    expect(diff.base.id).toBe(shop[1]!.id)
    expect(diff.totals.pages.regressed + diff.totals.pages.improved + diff.totals.pages.unchanged).toBeGreaterThan(0)
  })

  test('filters and sorts pages', async () => {
    client = createMockClient({ latency: 0, tickMs: 0 })
    const { items } = await client.call('scans.list', { status: 'done', limit: 10, offset: 0 })
    const id = items.find(s => s.devices.length === 2)!.id
    const result = await client.call('pages.list', { scanId: id, device: 'mobile', status: 'done', sort: 'performance', order: 'asc', limit: 20, offset: 0 })
    expect(result.items.every(p => p.device === 'mobile' && p.status === 'done')).toBe(true)
    const perf = result.items.map(p => p.scores.performance ?? 2)
    expect(perf).toEqual([...perf].sort((a, b) => a - b))
  })

  test('the running scan emits valid events until it finishes', async () => {
    client = createMockClient({ latency: 0, tickMs: 0 })
    const running = (await client.call('scans.list', { status: 'auditing', limit: 1, offset: 0 })).items[0]!
    const events: UnlighthouseEvent[] = []
    client.subscribe(running.id, e => events.push(e))
    for (let i = 0; i < 400; i++)
      client.tick()
    for (const e of events)
      event.parse(e)
    expect(events.at(-1)).toEqual({ type: 'scan:status', scanId: running.id, status: 'done' })
    const after = scan.parse(await client.call('scans.get', { scanId: running.id }))
    expect(after.stats.queued).toBe(0)
  })

  test('a started scan discovers, audits and finishes', async () => {
    client = createMockClient({ latency: 0, tickMs: 0 })
    const started = scan.parse(await client.call('scans.start', { site: 'https://new.example.io/', devices: ['mobile'] }))
    expect(started.status).toBe('queued')
    const types = new Set<string>()
    client.subscribe(started.id, e => types.add(e.type))
    for (let i = 0; i < 400; i++)
      client.tick()
    expect([...types]).toEqual(expect.arrayContaining(['scan:status', 'page:discovered', 'page:status', 'scan:progress']))
    expect((await client.call('scans.get', { scanId: started.id })).status).toBe('done')
  })

  test('unknown ids fail with NOT_FOUND', async () => {
    client = createMockClient({ latency: 0, tickMs: 0 })
    const error = await client.call('scans.get', { scanId: 'missing' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('NOT_FOUND')
  })
})
