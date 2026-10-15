import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureLogin } from '../src/audit/auth.ts'
import { findChrome } from '../src/audit/chrome.ts'
import { doctor } from '../src/audit/doctor.ts'
import { createAuditPool } from '../src/audit/pool.ts'
import { createRenderer } from '../src/audit/render.ts'
import { parseConfig } from '../src/config.ts'
import type { AuditJob } from '../src/contracts.ts'
import { UnlighthouseError } from '../src/errors.ts'
import type { OwnTmp } from './fixtures/own-tmp.ts'
import { ownTmp } from './fixtures/own-tmp.ts'
import { serveFixture } from './fixtures/site.ts'

const hasChrome = (() => {
  try {
    findChrome()
    return true
  }
  catch {
    return false
  }
})()

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  }
  catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

describe.skipIf(!hasChrome)('audit with Chrome', () => {
  const site = serveFixture()
  const pool = createAuditPool({ concurrency: 2, retries: 1 })
  let tmp: OwnTmp

  beforeAll(() => {
    tmp = ownTmp('unlighthouse-test-audit-')
  })

  afterAll(async () => {
    await pool.close()
    site.stop()
    tmp.restore()
  })

  const auditChromeProcesses = () => tmp.chromeProcesses('unlighthouse-audit-')

  function job(path: string, overrides: Partial<AuditJob> = {}): AuditJob {
    return {
      url: `${site.origin}${path}`,
      device: 'mobile',
      categories: ['performance', 'accessibility', 'best-practices', 'seo', 'agentic-browsing'],
      throttling: 'simulate',
      samples: 1,
      timeoutMs: 90_000,
      concurrency: 2,
      chromeFlags: [],
      auth: { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} },
      ...overrides,
    }
  }

  test('audits a page on mobile and desktop', async () => {
    const [mobile, desktop] = await Promise.all([pool.run(job('/')), pool.run(job('/', { device: 'desktop' }))])
    for (const result of [mobile, desktop]) {
      expect(result.statusCode).toBe(200)
      expect(result.scores.performance).not.toBeNull()
      expect(result.scores.accessibility!).toBeLessThan(1)
      expect(result.provenance.lighthouseVersion).toBe('13.5.0')
      const audits = new Set(result.findings.map(f => f.auditId))
      for (const id of ['image-alt', 'meta-description', 'render-blocking-insight', 'image-delivery-insight'])
        expect(audits.has(id)).toBe(true)
      expect(result.durationMs).toBeGreaterThan(0)
    }
    const report = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(bytes))))
    expect(report(mobile.report).configSettings.formFactor).toBe('mobile')
    expect(report(desktop.report).configSettings.formFactor).toBe('desktop')
    expect(desktop.scores.performance!).toBeGreaterThanOrEqual(mobile.scores.performance!)
  }, 120_000)

  test('injects headers, cookies, localStorage and sessionStorage before the page loads', async () => {
    const auth = { headers: { 'x-unlighthouse': 'yes' }, cookies: [{ name: 'sid', value: 'abc' }], localStorage: { token: 't1' }, sessionStorage: { tab: 's1' } }
    await pool.run(job('/auth', { auth, categories: ['seo'] }))
    const page = site.requests.find(r => r.path === '/auth' && r.headers['x-unlighthouse'] === 'yes')
    expect(page?.cookie).toBe('sid=abc')
    expect(site.requests.find(r => r.path === '/beacon')?.query).toEqual({ local: 't1', session: 's1' })
  }, 60_000)

  test('sends auth headers only to the site\'s own host and keeps them out of the stored report', async () => {
    const seen: Array<{ host: string, path: string, secret: string | null }> = []
    const log = (request: Request) => {
      const url = new URL(request.url)
      seen.push({ host: url.host, path: url.pathname, secret: request.headers.get('x-secret') })
    }
    const thirdParty = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch(request) {
      log(request)
      return new Response('body{}', { headers: { 'content-type': 'text/css' } })
    } })
    const own = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch(request) {
      log(request)
      if (new URL(request.url).pathname === '/own.css')
        return new Response('p{}', { headers: { 'content-type': 'text/css' } })
      return new Response(`<!doctype html><html lang="en"><head><title>t</title><link rel="stylesheet" href="/own.css"><link rel="stylesheet" href="http://localhost:${thirdParty.port}/third.css"></head><body><p>hi</p></body></html>`, { headers: { 'content-type': 'text/html' } })
    } })
    try {
      const result = await pool.run(job('/', { url: `http://127.0.0.1:${own.port}/`, categories: ['seo'], auth: { headers: { 'X-Secret': 's3cret' }, cookies: [], localStorage: {}, sessionStorage: {} } }))
      expect(seen.find(hit => hit.path === '/')?.secret).toBe('s3cret')
      expect(seen.find(hit => hit.path === '/own.css')?.secret).toBe('s3cret')
      expect(seen.some(hit => hit.path === '/third.css')).toBe(true)
      expect(seen.filter(hit => hit.path === '/third.css').every(hit => hit.secret === null)).toBe(true)
      expect(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(result.report)))).not.toContain('s3cret')
    }
    finally {
      own.stop(true)
      thirdParty.stop(true)
    }
  }, 60_000)

  test('fails page errors at once without retrying', async () => {
    const before = site.requests.filter(r => r.path === '/error').length
    const error = await rejection(pool.run(job('/error', { categories: ['seo'] })))
    expect(error).toBeInstanceOf(UnlighthouseError)
    expect((error as UnlighthouseError).code).toBe('AUDIT_FAILED')
    expect((error as UnlighthouseError).message).toContain('500')
    expect((error as UnlighthouseError).details).toMatchObject({ kind: 'page', code: 'ERRORED_DOCUMENT_REQUEST', attempts: 1 })
    expect(site.requests.filter(r => r.path === '/error').length - before).toBeLessThanOrEqual(2)
  }, 60_000)

  test('a timeout kills the worker and its Chrome, then retries', async () => {
    const before = auditChromeProcesses()
    let peak = 0
    const watch = setInterval(() => {
      peak = Math.max(peak, auditChromeProcesses() - before)
    }, 200)
    const started = Date.now()
    const error = await rejection(pool.run(job('/stall', { timeoutMs: 4_000, categories: ['seo'] })))
    clearInterval(watch)
    expect((error as UnlighthouseError).code).toBe('AUDIT_FAILED')
    expect((error as UnlighthouseError).details).toMatchObject({ kind: 'infra', code: 'TIMEOUT', attempts: 2 })
    expect(Date.now() - started).toBeLessThan(15_000)
    expect(peak).toBeGreaterThan(0)
    expect(auditChromeProcesses()).toBe(before)
  }, 30_000)

  test('an abort signal stops a running audit and its Chrome', async () => {
    const before = auditChromeProcesses()
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 2_000)
    const error = await rejection(pool.run(job('/stall', { categories: ['seo'] }), controller.signal))
    expect((error as Error).name).toBe('AbortError')
    expect(auditChromeProcesses()).toBe(before)
  }, 30_000)

  test('a worker whose Unlighthouse process died stops its Chrome and removes its temp dir', async () => {
    const before = auditChromeProcesses()
    const dirs = () => new Set(readdirSync(tmpdir()).filter(name => name.startsWith('unlighthouse-audit-')))
    const existing = dirs()
    const script = `import { createAuditPool } from ${JSON.stringify(join(import.meta.dir, '../src/audit/pool.ts'))}
      await createAuditPool({ concurrency: 1, retries: 0 }).run(${JSON.stringify(job('/stall', { categories: ['seo'] }))})`
    const parent = Bun.spawn([process.execPath, '-e', script], { stdout: 'ignore', stderr: 'ignore', env: { ...process.env } })
    const waitFor = async (check: () => boolean, ms: number) => {
      const deadline = Date.now() + ms
      while (!check() && Date.now() < deadline)
        await Bun.sleep(200)
      return check()
    }
    expect(await waitFor(() => auditChromeProcesses() > before, 15_000)).toBe(true)
    const created = [...dirs()].filter(name => !existing.has(name))
    expect(created).toHaveLength(1)
    parent.kill('SIGKILL')
    await parent.exited
    expect(await waitFor(() => auditChromeProcesses() === before && !existsSync(join(tmpdir(), created[0]!)), 10_000)).toBe(true)
  }, 40_000)

  test('captures cookies and storage from a login script', async () => {
    const config = parseConfig({
      site: site.origin,
      auth: { login: join(import.meta.dir, 'fixtures/login.ts'), cookies: [{ name: 'static', value: '1' }] },
    })
    const auth = await captureLogin(config)
    expect(auth.cookies).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'static', value: '1' }),
      expect.objectContaining({ name: 'sid', value: 'from-login' }),
    ]))
    expect(auth.localStorage).toEqual({ token: 'from-login' })
    expect(auth.sessionStorage).toEqual({ tab: 'login-tab' })
  }, 60_000)

  test('an aborted login script does not leave its Chrome running', async () => {
    const loginChrome = () => tmp.chromeProcesses('unlighthouse-chrome-')
    const before = loginChrome()
    const config = parseConfig({ site: site.origin, auth: { login: join(import.meta.dir, 'fixtures/login-hang.ts') } })
    void captureLogin(config, undefined, AbortSignal.timeout(2_000)).catch(() => {})
    const deadline = Date.now() + 15_000
    let seen = false
    while (Date.now() < deadline) {
      const count = loginChrome()
      seen ||= count > before
      if (seen && count === before)
        break
      await Bun.sleep(200)
    }
    expect(seen).toBe(true)
    expect(loginChrome()).toBe(before)
  }, 30_000)

  test('renders client-side pages for discovery', async () => {
    const renderer = createRenderer()
    try {
      const spa = await renderer.fetchPage(`${site.origin}/spa`)
      expect(spa).toMatchObject({ status: 200, finalUrl: `${site.origin}/spa` })
      expect(spa.contentType).toContain('text/html')
      expect(spa.html).toContain('/rendered-link')
      const missing = await renderer.fetchPage(`${site.origin}/missing`)
      expect(missing.status).toBe(404)
    }
    finally {
      await renderer.close()
    }
  }, 60_000)

  test('doctor reports a working setup', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'unlighthouse-doctor-test-'))
    try {
      const report = await doctor(parseConfig({ dataDir }))
      expect(report.ok).toBe(true)
      expect(report.checks.map(check => check.id)).toEqual(['chrome', 'chrome-launch', 'bun', 'lighthouse', 'data-dir', 'cpu'])
      expect(report.chromeVersion).toMatch(/\d+\.\d+/)
      expect(report.recommendedConcurrency).toBeGreaterThanOrEqual(1)
    }
    finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('audit pool without Chrome', () => {
  test('fails with CHROME_NOT_FOUND when the configured Chrome is missing', async () => {
    const pool = createAuditPool({ concurrency: 1, retries: 0 })
    const error = await rejection(pool.run({
      url: 'http://127.0.0.1:9/',
      device: 'mobile',
      categories: ['seo'],
      throttling: 'simulate',
      samples: 1,
      timeoutMs: 10_000,
      concurrency: 1,
      chromePath: '/nonexistent/chrome',
      chromeFlags: [],
      auth: { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} },
    }))
    expect((error as UnlighthouseError).code).toBe('CHROME_NOT_FOUND')
    await pool.close()
  })
})
