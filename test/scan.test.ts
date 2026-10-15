import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseConfig } from '../src/config.ts'
import type { Store } from '../src/contracts.ts'
import { openStore } from '../src/db/index.ts'
import { UnlighthouseError } from '../src/errors.ts'
import { EventBus } from '../src/events.ts'
import type { UnlighthouseEvent } from '../src/events.ts'
import type { Scanner, ScannerOptions } from '../src/scan/runner.ts'
import { createScanner } from '../src/scan/runner.ts'
import { createFakePool, fakeResult } from './fixtures/fake-pool.ts'
import type { FakePoolOptions } from './fixtures/fake-pool.ts'
import { servePages } from './fixtures/pages.ts'

const BLOG = ['/blog/post-1', '/blog/post-2', '/blog/post-3', '/blog/post-4', '/blog/post-5', '/blog/post-6']
const site = servePages(['/', '/about', ...BLOG], { broken: ['/gone'] })
const empty = servePages([])

let dir: string
let store: Store
let bus: EventBus
let events: UnlighthouseEvent[]
const scanners: Scanner[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unlighthouse-scan-'))
  store = openStore(join(dir, 'data'))
  bus = new EventBus()
  events = []
  bus.on(event => events.push(event))
})

afterEach(async () => {
  for (const scanner of scanners.splice(0))
    await scanner.close()
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

afterAll(() => {
  site.stop()
  empty.stop()
})

function scanner(pool: FakePoolOptions = {}, extra: Partial<ScannerOptions> = {}) {
  const fake = createFakePool(pool)
  const instance = createScanner({ store, bus, createPool: fake.createPool, cpus: 12, cancelPollMs: 20, lockRetryMs: 20, ...extra })
  scanners.push(instance)
  return { fake, scanner: instance }
}

async function until(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error('condition not reached in time')
    await Bun.sleep(5)
  }
}

describe('scan runner', () => {
  test('discovers, samples by template, audits every device and finishes with honest stats', async () => {
    const { fake, scanner: runner } = scanner()
    const started = runner.start({ site: site.origin, devices: ['mobile', 'desktop'], sampling: { perTemplate: 2 } })
    expect(started.status).toBe('queued')

    const scan = await runner.wait(started.id, 10_000)
    expect(scan.status).toBe('done')
    expect(scan.stats).toEqual({ discovered: 8, queued: 0, done: 8, failed: 0, skipped: 8 })
    expect(scan.lighthouseVersion).toBe('13.5.0')
    expect(scan.startedAt).toBeGreaterThan(0)
    expect(scan.finishedAt).toBeGreaterThanOrEqual(scan.startedAt!)
    expect(store.brokenLinks(scan.id).map(link => link.url)).toEqual([`${site.origin}/gone`])

    const pages = store.allPages(scan.id)
    expect(pages).toHaveLength(16)
    const blog = pages.filter(page => page.template === '/blog/*')
    expect(blog.filter(page => page.status === 'done')).toHaveLength(4)
    expect(blog.filter(page => page.status === 'skipped')).toHaveLength(8)
    expect(new Set(fake.jobs.map(job => `${job.url} ${job.device}`)).size).toBe(8)
    expect(fake.pools).toEqual([{ concurrency: 2, retries: 1 }])
    expect(fake.jobs.every(job => job.concurrency === 2)).toBe(true)
    expect(fake.closed).toBe(1)

    const statuses = events.filter(event => event.type === 'scan:status' && event.scanId === scan.id).map(event => event.type === 'scan:status' && event.status)
    expect(statuses).toEqual(['queued', 'discovering', 'auditing', 'done'])
    expect(events.filter(event => event.type === 'page:discovered')).toHaveLength(8)
    expect(events.filter(event => event.type === 'page:status' && event.status === 'done')).toHaveLength(8)
    const last = events.filter(event => event.type === 'scan:progress').at(-1)
    expect(last).toMatchObject({ discovered: 8, queued: 0, done: 8, failed: 0, skipped: 8 })
  })

  test('runs one scan at a time and starts queued scans in order', async () => {
    const { fake, scanner: runner } = scanner({ delayMs: 20 })
    const first = runner.start({ site: site.origin, urls: ['/', '/about'], concurrency: 2 })
    const second = runner.start({ site: site.origin, urls: ['/about'] })
    expect(store.getScan(second.id)!.status).toBe('queued')
    await until(() => store.getScan(first.id)!.status === 'auditing')
    expect(store.getScan(second.id)!.status).toBe('queued')

    const a = await runner.wait(first.id, 5000)
    const b = await runner.wait(second.id, 5000)
    expect([a.status, b.status]).toEqual(['done', 'done'])
    expect(b.startedAt!).toBeGreaterThanOrEqual(a.finishedAt!)
    expect(fake.maxActive).toBeLessThanOrEqual(2)
  })

  test('cancels a running scan by aborting its audits, and dequeues a waiting one', async () => {
    const { fake, scanner: runner } = scanner({ delayMs: 10_000 })
    const running = runner.start({ site: site.origin, urls: ['/', '/about', '/blog/post-1'], concurrency: 1 })
    const waiting = runner.start({ site: site.origin, urls: ['/'] })
    await until(() => fake.jobs.length === 1)

    const queued = await runner.cancel(waiting.id)
    expect(queued.status).toBe('cancelled')

    const cancelled = await runner.cancel(running.id)
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.finishedAt).not.toBeNull()
    expect(cancelled.stats).toEqual({ discovered: 3, queued: 0, done: 0, failed: 0, skipped: 3 })
    expect(fake.aborted).toHaveLength(1)
    expect(fake.closed).toBe(1)
    expect(store.allPages(running.id).every(page => page.status === 'skipped' && page.error === 'Scan cancelled')).toBe(true)
    expect(fake.jobs.some(job => job.url === `${site.origin}/` && fake.jobs.indexOf(job) > 0)).toBe(false)
    await expect(runner.cancel(running.id)).rejects.toMatchObject({ code: 'SCAN_NOT_RUNNING' })
  })

  test('cancels a scan that another process marked cancelled in the database', async () => {
    const { scanner: runner } = scanner({ delayMs: 10_000 })
    const scan = runner.start({ site: site.origin, urls: ['/', '/about'] })
    await until(() => store.getScan(scan.id)!.status === 'auditing')
    store.updateScan(scan.id, { status: 'cancelled' })
    const final = await runner.wait(scan.id, 5000)
    expect(final.status).toBe('cancelled')
    await runner.idle()
    expect(store.allPages(scan.id).every(page => page.status === 'skipped')).toBe(true)
  })

  test('marks failing pages and still finishes; fails the scan when every audit fails', async () => {
    const { scanner: runner } = scanner({ fail: job => job.url.endsWith('/about') ? new UnlighthouseError('AUDIT_FAILED', 'Lighthouse could not audit /about') : null })
    const partial = await runner.wait(runner.start({ site: site.origin, urls: ['/', '/about'], devices: ['mobile', 'desktop'] }).id, 5000)
    expect(partial.status).toBe('done')
    expect(partial.stats).toEqual({ discovered: 2, queued: 0, done: 2, failed: 2, skipped: 0 })
    expect(store.getPage(partial.id, `${site.origin}/about`, 'mobile')).toMatchObject({ status: 'failed', error: 'Lighthouse could not audit /about' })

    const all = await runner.wait(runner.start({ site: site.origin, urls: ['/about'] }).id, 5000)
    expect(all.status).toBe('failed')
    expect(all.error).toContain('All 1 audit(s) failed')
  })

  test('fails fast when Chrome is missing instead of failing every page', async () => {
    const { fake, scanner: runner } = scanner({ fail: () => new UnlighthouseError('CHROME_NOT_FOUND', 'No Chrome or Chromium installation found.') })
    const scan = await runner.wait(runner.start({ site: site.origin, urls: ['/', '/about', '/blog/post-1'], concurrency: 1 }).id, 5000)
    expect(scan.status).toBe('failed')
    expect(scan.error).toContain('No Chrome')
    expect(fake.jobs).toHaveLength(1)
    expect(scan.stats.queued).toBe(0)
  })

  test('fails a scan that finds no pages, and rejects a missing site', async () => {
    const { scanner: runner } = scanner()
    const scan = await runner.wait(runner.start({ site: empty.origin }).id, 5000)
    expect(scan.status).toBe('failed')
    expect(scan.error).toContain('No pages found')
    expect(() => runner.start({})).toThrow(UnlighthouseError)
    expect(() => runner.start({ site: 'not a url' })).toThrow(UnlighthouseError)
  })

  test('rescans one page of a finished scan in place', async () => {
    let performance = 0.5
    const { fake, scanner: runner } = scanner({ performance: () => performance })
    const scan = await runner.wait(runner.start({ site: site.origin, urls: ['/', '/about'] }).id, 5000)
    expect(store.getPage(scan.id, `${site.origin}/about`, 'mobile')!.scores.performance).toBe(0.5)

    performance = 0.9
    const queued = runner.rescanPage(scan.id, `${site.origin}/about`, 'mobile')
    expect(queued.status).toBe('queued')
    await runner.idle()
    expect(store.getPage(scan.id, `${site.origin}/about`, 'mobile')).toMatchObject({ status: 'done', scores: { performance: 0.9 } })
    expect(fake.jobs).toHaveLength(3)
    expect(store.getScan(scan.id)!.stats).toMatchObject({ queued: 0, done: 2 })
    expect(() => runner.rescanPage(scan.id, `${site.origin}/missing`, 'mobile')).toThrow(UnlighthouseError)
  })

  test('refuses to rescan while the scan is still running', async () => {
    const { scanner: runner } = scanner({ delayMs: 10_000 })
    const scan = runner.start({ site: site.origin, urls: ['/'] })
    await until(() => store.getScan(scan.id)!.status === 'auditing')
    expect(() => runner.rescanPage(scan.id, `${site.origin}/`, 'mobile')).toThrow(expect.objectContaining({ code: 'SCAN_ACTIVE' }))
  })

  test('wait returns the unfinished scan on timeout', async () => {
    const { scanner: runner } = scanner({ delayMs: 10_000 })
    const scan = runner.start({ site: site.origin, urls: ['/'] })
    const startedAt = Date.now()
    const waited = await runner.wait(scan.id, 50)
    expect(Date.now() - startedAt).toBeLessThan(1000)
    expect(['queued', 'discovering', 'auditing']).toContain(waited.status)
    await expect(runner.wait('missing', 10)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  test('resumes audits left by a crashed process and fails scans interrupted earlier', async () => {
    const config = parseConfig({ site: site.origin, urls: ['/', '/about', '/blog/post-1'] })
    const crashed = store.createScan({ origin: site.origin, devices: ['mobile'], options: config })
    store.insertPages(crashed.id, ['/', '/about', '/blog/post-1'].map(path => ({ url: `${site.origin}${path}`, path, template: path, device: 'mobile' as const, status: 'queued' as const })))
    store.updateScan(crashed.id, { status: 'auditing', startedAt: Date.now() })
    store.savePageResult(crashed.id, `${site.origin}/`, 'mobile', fakeResult({ url: `${site.origin}/`, device: 'mobile', categories: [], throttling: 'simulate', samples: 1, timeoutMs: 1, concurrency: 1, chromeFlags: [], auth: { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} } }, 0.6))
    store.setPageStatus(crashed.id, `${site.origin}/about`, 'mobile', 'running')
    const discovering = store.createScan({ origin: site.origin, devices: ['mobile'], options: config })
    store.updateScan(discovering.id, { status: 'discovering' })
    const queued = store.createScan({ origin: site.origin, devices: ['mobile'], options: config })

    const { fake, scanner: runner } = scanner({}, { lockPath: join(dir, 'data', 'scanner.lock') })
    expect(runner.recover()).toEqual([crashed.id])
    const resumed = await runner.wait(crashed.id, 5000)
    expect(resumed.status).toBe('done')
    expect(resumed.stats).toEqual({ discovered: 3, queued: 0, done: 3, failed: 0, skipped: 0 })
    expect(fake.jobs.map(job => job.url).sort()).toEqual([`${site.origin}/about`, `${site.origin}/blog/post-1`])
    expect(store.getPage(crashed.id, `${site.origin}/`, 'mobile')!.scores.performance).toBe(0.6)
    for (const id of [discovering.id, queued.id])
      expect(store.getScan(id)).toMatchObject({ status: 'failed', error: expect.stringContaining('Interrupted') })
  })

  test('recovers pages left queued or running by a rescan whose process died, and lets them be rescanned', async () => {
    const config = parseConfig({ site: site.origin, urls: ['/', '/about', '/blog/post-1'] })
    const scan = store.createScan({ origin: site.origin, devices: ['mobile'], options: config })
    const url = (path: string) => `${site.origin}${path}`
    store.insertPages(scan.id, ['/', '/about', '/blog/post-1'].map(path => ({ url: url(path), path, template: path, device: 'mobile' as const, status: 'queued' as const })))
    const job = { device: 'mobile' as const, categories: [], throttling: 'simulate' as const, samples: 1, timeoutMs: 1, concurrency: 1, chromeFlags: [], auth: { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} } }
    store.savePageResult(scan.id, url('/'), 'mobile', fakeResult({ ...job, url: url('/') }, 0.6))
    store.setPageStatus(scan.id, url('/about'), 'mobile', 'failed', 'Navigation timeout')
    store.setPageStatus(scan.id, url('/blog/post-1'), 'mobile', 'running')
    store.updateScan(scan.id, { status: 'done', finishedAt: Date.now() })
    expect(store.queueRescan(scan.id, url('/'), 'mobile')).toBe('done')
    store.setPageStatus(scan.id, url('/'), 'mobile', 'running')
    expect(store.queueRescan(scan.id, url('/about'), 'mobile')).toBe('failed')
    expect(() => store.queueRescan(scan.id, url('/about'), 'mobile')).toThrow('already queued')

    const { scanner: runner } = scanner({ performance: () => 0.95 }, { lockPath: join(dir, 'data', 'scanner.lock') })
    expect(() => runner.rescanPage(scan.id, url('/'), 'mobile')).toThrow('already running')
    expect(runner.recover()).toEqual([])
    expect(store.getPage(scan.id, url('/'), 'mobile')).toMatchObject({ status: 'done', error: null, scores: { performance: 0.6 } })
    expect(store.getPage(scan.id, url('/about'), 'mobile')).toMatchObject({ status: 'failed', error: 'Navigation timeout' })
    expect(store.getPage(scan.id, url('/blog/post-1'), 'mobile')).toMatchObject({ status: 'failed', error: expect.stringContaining('Interrupted') })
    expect(store.getScan(scan.id)!.stats).toEqual({ discovered: 3, queued: 0, done: 1, failed: 2, skipped: 0 })
    expect(store.interruptedRescans()).toEqual([])

    for (const path of ['/', '/blog/post-1'])
      runner.rescanPage(scan.id, url(path), 'mobile')
    await runner.idle()
    expect(store.getPage(scan.id, url('/'), 'mobile')).toMatchObject({ status: 'done', scores: { performance: 0.95 } })
    expect(store.getPage(scan.id, url('/blog/post-1'), 'mobile')).toMatchObject({ status: 'done', error: null, scores: { performance: 0.95 } })
    expect(store.getScan(scan.id)!.stats).toMatchObject({ done: 2, failed: 1 })
  })

  test('a second process neither hijacks a running scan nor runs its own at the same time', async () => {
    const lockPath = join(dir, 'data', 'scanner.lock')
    const first = scanner({ delayMs: 200 }, { lockPath })
    const scan = first.scanner.start({ site: site.origin, urls: ['/', '/about'], concurrency: 1 })
    await until(() => store.getScan(scan.id)!.status === 'auditing')

    const second = scanner({}, { lockPath })
    expect(second.scanner.recover()).toEqual([])
    expect(store.getScan(scan.id)!.status).toBe('auditing')
    const other = second.scanner.start({ site: site.origin, urls: ['/'] })
    await Bun.sleep(50)
    expect(store.getScan(other.id)!.status).toBe('queued')
    expect(events.some(event => event.type === 'log' && event.message.includes('Waiting for another Unlighthouse process'))).toBe(true)

    const done = await first.scanner.wait(scan.id, 5000)
    const after = await second.scanner.wait(other.id, 5000)
    expect(done.status).toBe('done')
    expect(after.status).toBe('done')
    expect(after.startedAt!).toBeGreaterThanOrEqual(done.finishedAt!)
  })
})
