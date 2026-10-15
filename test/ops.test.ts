import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Store } from '../src/contracts.ts'
import { openStore } from '../src/db/index.ts'
import { EventBus } from '../src/events.ts'
import { operations } from '../src/ops/operations.ts'
import type { OperationContext } from '../src/ops/registry.ts'
import { invoke } from '../src/ops/registry.ts'
import { createScanner } from '../src/scan/runner.ts'
import type { Scan } from '../src/types.ts'
import { createFakePool } from './fixtures/fake-pool.ts'
import { servePages } from './fixtures/pages.ts'

const site = servePages(['/', '/about', '/blog/post-1', '/blog/post-2', '/blog/post-3', '/blog/post-4'], { broken: ['/gone'] })

let dir: string
let store: Store
let ctx: OperationContext
let performance = 0.8

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unlighthouse-ops-'))
  store = openStore(join(dir, 'data'))
  const fake = createFakePool({ performance: job => job.url.endsWith('/about') ? performance - 0.3 : performance })
  ctx = { store, scanner: createScanner({ store, bus: new EventBus(), createPool: fake.createPool, cpus: 12 }) }
})

afterEach(async () => {
  await ctx.scanner.close()
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

afterAll(() => site.stop())

function call(name: string, input: unknown = {}): Promise<any> {
  return invoke(operations, ctx, name, input)
}

async function scanned(input: Record<string, unknown> = {}): Promise<Scan> {
  const scan = await call('scans.start', { site: site.origin, ...input })
  return call('scans.wait', { scanId: scan.id, timeoutMs: 10_000 })
}

describe('operations', () => {
  test('cover every operation the dashboard calls, with descriptions for agents', () => {
    const source = readFileSync(join(import.meta.dir, '../src/ui/api.ts'), 'utf8')
    const called = [...source.matchAll(/^\s+'([a-z.]+)': \{ input/gm)].map(match => match[1])
    expect(called.length).toBeGreaterThan(10)
    const names = operations.map(operation => operation.name)
    for (const name of called)
      expect(names).toContain(name!)
    expect(names).toContain('scans.templates')
    expect(new Set(names).size).toBe(names.length)
    for (const operation of operations)
      expect(operation.description.length).toBeGreaterThan(60)
  })

  test('validate input and report unknown operations and scans with stable codes', async () => {
    await expect(call('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(call('scans.get', {})).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(call('scans.start', { site: 'not a url' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    for (const site of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi'])
      await expect(call('scans.start', { site })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect((await call('sites.list')).map((entry: { origin: string }) => entry.origin)).not.toContain('null')
    const ignored = await call('scans.start', { site: site.origin, chromePath: '/bin/sh', auth: { login: './evil.ts' } })
    expect(ignored.options).not.toHaveProperty('chromePath')
    expect(ignored.options).not.toHaveProperty('auth.login')
    await expect(call('scans.get', { scanId: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(call('pages.list', { scanId: 'x', limit: 10_000 })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  test('start, wait, list and read a scan through the registry', async () => {
    const scan = await scanned({ devices: ['mobile', 'desktop'], sampling: { perTemplate: 2 }, label: 'first' })
    expect(scan).toMatchObject({ status: 'done', label: 'first', devices: ['mobile', 'desktop'] })
    expect(scan.stats).toEqual({ discovered: 6, queued: 0, done: 8, failed: 0, skipped: 4 })

    const list = await call('scans.list', { origin: site.origin })
    expect(list.total).toBe(1)
    expect(list.items[0].id).toBe(scan.id)

    const sites = await call('sites.list')
    expect(sites).toHaveLength(1)
    expect(sites[0]).toMatchObject({ origin: site.origin, scans: 1, lastScan: { id: scan.id } })
    expect(sites[0].lastScores.mobile.performance).toBeCloseTo(0.73, 2)
    expect(sites[0].lastScores.desktop.seo).toBe(0.8)

    expect(await call('scans.templates', { scanId: scan.id })).toEqual([
      { template: '/blog/*', pages: 4 },
      { template: '/', pages: 1 },
      { template: '/about', pages: 1 },
    ])

    const pages = await call('pages.list', { scanId: scan.id, device: 'mobile', status: 'done', sort: 'performance', order: 'asc' })
    expect(pages.total).toBe(4)
    expect(pages.items[0].url).toBe(`${site.origin}/about`)

    const page = await call('pages.get', { scanId: scan.id, url: `${site.origin}/about`, device: 'mobile' })
    expect(page.findings).toHaveLength(1)
    expect(page.findings[0].auditId).toBe('image-delivery-insight')
    await expect(call('pages.get', { scanId: scan.id, url: `${site.origin}/nope`, device: 'mobile' })).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const issues = await call('issues.list', { scanId: scan.id })
    expect(issues.total).toBe(1)
    const issue = await call('issues.get', { scanId: scan.id, auditId: 'image-delivery-insight', itemKey: '/hero.png' })
    expect(issue.issue.pages).toBe(4)
    expect(issue.pages).toHaveLength(8)

    expect(await call('scans.brokenLinks', { scanId: scan.id })).toEqual([{ url: `${site.origin}/gone`, status: 404, from: expect.any(String) }])

    const summary = await call('scans.summary', { scanId: scan.id })
    expect(summary.scan.id).toBe(scan.id)
    expect(summary.pages).toMatchObject({ discovered: 6, audited: 4, skippedBySampling: 2 })
    expect(summary.baseline).toBeUndefined()
  })

  test('summary, compare and budgets use the baseline scan', async () => {
    const base = await scanned({ urls: ['/', '/about'] })
    performance = 0.4
    const head = await scanned({ urls: ['/', '/about'] })
    performance = 0.8

    const summary = await call('scans.summary', { scanId: head.id })
    expect(summary.baseline.scanId).toBe(base.id)
    expect(summary.baseline.pages.regressed).toBe(2)

    const comparison = await call('compare', { base: base.id, head: head.id })
    expect(comparison.base.id).toBe(base.id)
    expect(comparison.totals.pages.regressed).toBe(2)

    const budgets = await call('budgets.check', { scanId: head.id, budgets: { scores: { performance: 0.9 }, regression: { performance: 0.1 } } })
    expect(budgets.passed).toBe(false)
    expect(budgets.baseline).toBe(base.id)
    expect(budgets.results.map((result: { rule: string }) => result.rule)).toEqual(expect.arrayContaining([expect.stringContaining('performance')]))

    const configured = await call('budgets.check', { scanId: head.id })
    expect(configured.passed).toBe(true)
  })

  test('redact auth secrets from scans returned to clients', async () => {
    const scanner = createScanner({ store, bus: new EventBus(), config: { auth: { headers: { authorization: 'Bearer secret' }, cookies: [{ name: 'sid', value: 'secret' }] } }, createPool: createFakePool().createPool })
    const withAuth = scanner.start({ site: site.origin, urls: ['/'] })
    await scanner.wait(withAuth.id, 5000)
    await scanner.close()
    const visible = JSON.stringify(await call('scans.get', { scanId: withAuth.id }))
    expect(visible).not.toContain('secret')
    expect(visible).toContain('[redacted]')
    expect(JSON.stringify(store.getScan(withAuth.id)!.options)).toContain('secret')
  })

  test('cancel, wait with timeout, rescan and delete', async () => {
    const scan = await scanned({ urls: ['/', '/about'] })
    const rescanned = await call('pages.rescan', { scanId: scan.id, url: `${site.origin}/about`, device: 'mobile' })
    expect(rescanned.status).toBe('queued')
    await ctx.scanner.idle()
    expect((await call('pages.get', { scanId: scan.id, url: `${site.origin}/about`, device: 'mobile' })).status).toBe('done')

    await expect(call('scans.cancel', { scanId: scan.id })).rejects.toMatchObject({ code: 'SCAN_NOT_RUNNING' })
    expect(await call('scans.delete', { scanId: scan.id })).toEqual({ deleted: scan.id })
    await expect(call('scans.get', { scanId: scan.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const slowStore = store
    const slow = createScanner({ store: slowStore, bus: new EventBus(), createPool: createFakePool({ delayMs: 10_000 }).createPool })
    const slowCtx = { store: slowStore, scanner: slow }
    const running = await invoke(operations, slowCtx, 'scans.start', { site: site.origin, urls: ['/'] }) as Scan
    const waited = await invoke(operations, slowCtx, 'scans.wait', { scanId: running.id, timeoutMs: 30 }) as Scan
    expect(waited.status).not.toBe('done')
    await expect(invoke(operations, slowCtx, 'scans.delete', { scanId: running.id })).rejects.toMatchObject({ code: 'SCAN_ACTIVE' })
    const cancelled = await invoke(operations, slowCtx, 'scans.cancel', { scanId: running.id }) as Scan
    expect(cancelled.status).toBe('cancelled')
    await slow.close()
  })

  test('deleting a finished scan stops its pending rescan instead of auditing into a deleted scan', async () => {
    const scan = await scanned({ urls: ['/'] })
    const fake = createFakePool({ delayMs: 10_000 })
    const bus = new EventBus()
    const errors: string[] = []
    bus.on(event => event.type === 'log' && event.level === 'error' && errors.push(event.message))
    const rescanning = createScanner({ store, bus, createPool: fake.createPool })
    const rescanCtx = { store, scanner: rescanning }
    try {
      await invoke(operations, rescanCtx, 'pages.rescan', { scanId: scan.id, url: `${site.origin}/`, device: 'mobile' })
      expect(rescanning.active()).toBe(scan.id)
      expect(await invoke(operations, rescanCtx, 'scans.delete', { scanId: scan.id })).toEqual({ deleted: scan.id })
      expect(fake.aborted).toHaveLength(fake.jobs.length)
      expect(rescanning.active()).toBeNull()
      expect(store.getScan(scan.id)).toBeNull()
      expect(errors).toEqual([])
    }
    finally {
      await rescanning.close()
    }
  })
})
