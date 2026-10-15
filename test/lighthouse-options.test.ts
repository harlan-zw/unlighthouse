import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Result } from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import { lighthouseConfig, lighthouseFlags, resolvePlugins } from '../src/audit/lighthouse.ts'
import { checkAuditSetup } from '../src/audit/pool.ts'
import { finalScreenshot, reconcile } from '../src/audit/reconcile.ts'
import { makeThumbnail, THUMBNAIL_WIDTH } from '../src/audit/thumbnail.ts'
import { parseConfig } from '../src/config.ts'
import type { AuditJob } from '../src/contracts.ts'
import { openStore } from '../src/db/index.ts'
import { UnlighthouseError } from '../src/errors.ts'
import { EventBus } from '../src/events.ts'
import { operations } from '../src/ops/operations.ts'
import { invoke } from '../src/ops/registry.ts'
import { createScanner } from '../src/scan/runner.ts'
import { createServer } from '../src/server/app.ts'
import { exportScan } from '../src/server/export.ts'
import { CATEGORIES } from '../src/types.ts'
import { createFakePool, fakeResult } from './fixtures/fake-pool.ts'
import { writePlugin } from './fixtures/plugin.ts'
import { servePages } from './fixtures/pages.ts'

const recorded = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(await Bun.file(join(import.meta.dir, 'fixtures/lhr-mobile.json.gz')).bytes()))) as Result

const job: AuditJob = {
  url: recorded.finalDisplayedUrl,
  device: 'mobile',
  categories: [...CATEGORIES],
  throttling: 'simulate',
  samples: 1,
  timeoutMs: 90_000,
  concurrency: 1,
  chromeFlags: [],
  auth: { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} },
}

const dirs: string[] = []
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of dirs)
    rmSync(dir, { recursive: true, force: true })
})

function isWebp(bytes: Uint8Array): boolean {
  const text = new TextDecoder().decode(bytes.subarray(0, 12))
  return text.startsWith('RIFF') && text.endsWith('WEBP')
}

function configError(input: unknown): UnlighthouseError {
  try {
    parseConfig(input)
  }
  catch (error) {
    if (error instanceof UnlighthouseError)
      return error
    throw error
  }
  throw new Error('expected INVALID_CONFIG')
}

describe('lighthouse options in the config', () => {
  test('accept installed audit ids and default to the local runner', () => {
    const config = parseConfig({ lighthouse: { skipAudits: ['modern-http-insight', 'image-alt'], onlyAudits: ['final-screenshot'] } })
    expect(config.lighthouse).toEqual({ skipAudits: ['modern-http-insight', 'image-alt'], onlyAudits: ['final-screenshot'] })
    expect(config.runner).toEqual({ type: 'local' })
    expect(parseConfig({}).lighthouse).toEqual({})
  })

  test('reject an unknown audit id with INVALID_CONFIG and the closest match', () => {
    const error = configError({ lighthouse: { skipAudits: ['image-alt', 'imge-alt'] } })
    expect(error.code).toBe('INVALID_CONFIG')
    expect(error.message).toContain('Unknown Lighthouse audit "imge-alt"')
    expect(error.message).toContain('did you mean "image-alt"?')
    expect(configError({ lighthouse: { onlyAudits: ['largest-contentful-paint-element'] } }).message).toContain('"largest-contentful-paint"')
  })

  test('allow audit ids from plugins, which only exist once the plugin loads', () => {
    expect(parseConfig({ lighthouse: { plugins: ['lighthouse-plugin-x'], onlyAudits: ['x-audit'] } }).lighthouse.onlyAudits).toEqual(['x-audit'])
  })

  test('validate runners and fill their defaults', () => {
    expect(parseConfig({ runner: { type: 'psi' } }).runner).toEqual({
      type: 'psi',
      apiKeyEnv: 'PSI_API_KEY',
      endpoint: 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',
      maxRetries: 3,
      backoffMs: 5000,
    })
    expect(parseConfig({ runner: { type: 'cdp', endpoint: 'wss://chrome.example.com?token=x' } }).runner).toEqual({ type: 'cdp', endpoint: 'wss://chrome.example.com?token=x', headers: {} })
    expect(configError({ runner: { type: 'cdp' } }).code).toBe('INVALID_CONFIG')
    expect(configError({ runner: { type: 'cdp', endpoint: 'file:///tmp/chrome' } }).code).toBe('INVALID_CONFIG')
    expect(configError({ runner: { type: 'browserstack' } }).code).toBe('INVALID_CONFIG')
  })
})

describe('lighthouse pass-through', () => {
  test('passes skipAudits and onlyAudits as Lighthouse flags; onlyAudits replaces the category filter', () => {
    expect(lighthouseFlags({ ...job, lighthouse: { skipAudits: ['modern-http-insight'] } })).toMatchObject({ skipAudits: ['modern-http-insight'], onlyCategories: [...CATEGORIES] })
    const only = lighthouseFlags({ ...job, lighthouse: { onlyAudits: ['image-alt'] } })
    expect(only.onlyAudits).toEqual(['image-alt'])
    expect(only.onlyCategories).toBeUndefined()
  })

  test('merges settings into the device config and adds plugins with their categories', () => {
    const config = lighthouseConfig({ device: 'desktop', lighthouse: { settings: { maxWaitForLoad: 12_345 }, plugins: ['lighthouse-plugin-x'] } })!
    expect(config.settings).toMatchObject({ ...desktopConfig.settings, maxWaitForLoad: 12_345 })
    expect(config.plugins).toEqual(['lighthouse-plugin-x'])
    expect(lighthouseConfig({ device: 'mobile', lighthouse: { settings: { locale: 'de' } } })).toEqual({ extends: 'lighthouse:default', settings: { locale: 'de' } })
    expect(lighthouseFlags({ ...job, lighthouse: { plugins: ['lighthouse-plugin-x'] } }).onlyCategories).toEqual([...CATEGORIES, 'lighthouse-plugin-x'])
  })

  test('resolves plugins from the project directory and explains missing ones', () => {
    const project = tempDir('unlighthouse-plugin-project-')
    writePlugin(project)
    expect(resolvePlugins(['lighthouse-plugin-unlighthouse-test'], project)[0]).toBe(join(project, 'node_modules/lighthouse-plugin-unlighthouse-test/plugin.js'))
    expect(() => resolvePlugins(['lighthouse-plugin-unlighthouse-test'], tempDir('unlighthouse-empty-project-'))).toThrow(/is not installed in/)
    expect(() => resolvePlugins(['left-pad'], project)).toThrow(/lighthouse-plugin-\*/)
  })

  test('reads plugin category audits as findings without a Unlighthouse category', () => {
    const lhr = structuredClone(recorded)
    lhr.categories['lighthouse-plugin-x'] = { id: 'lighthouse-plugin-x', title: 'X', score: 0, auditRefs: [{ id: 'x-audit', weight: 1 }] } as unknown as Result['categories'][string]
    lhr.audits['x-audit'] = { id: 'x-audit', title: 'X fails', description: '', score: 0, scoreDisplayMode: 'binary' } as Result['audits'][string]
    const findings = reconcile(lhr, { ...job, lighthouse: { plugins: ['lighthouse-plugin-x'] } }, null).findings
    expect(findings.find(finding => finding.auditId === 'x-audit')).toMatchObject({ category: null, title: 'X fails', severity: 'fail' })
    expect(reconcile(lhr, job, null).findings.some(finding => finding.auditId === 'x-audit')).toBe(false)
  })
})

describe('audit setup checks', () => {
  const auth = { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} }

  test('the psi runner needs its key and refuses what PSI cannot apply', () => {
    const runner = parseConfig({ runner: { type: 'psi', apiKeyEnv: 'UNLIGHTHOUSE_TEST_MISSING_KEY' } }).runner
    expect(() => checkAuditSetup({ runner, auth })).toThrow(/UNLIGHTHOUSE_TEST_MISSING_KEY/)
    process.env['UNLIGHTHOUSE_TEST_SETUP_KEY'] = 'k'
    const keyed = parseConfig({ runner: { type: 'psi', apiKeyEnv: 'UNLIGHTHOUSE_TEST_SETUP_KEY' } }).runner
    expect(checkAuditSetup({ runner: keyed, auth, chromePath: '/missing/chrome' })).toEqual({})
    expect(() => checkAuditSetup({ runner: keyed, auth: { ...auth, headers: { authorization: 'x' } } })).toThrow(/cannot apply auth/)
    expect(() => checkAuditSetup({ runner: keyed, auth, lighthouse: { skipAudits: ['image-alt'] } })).toThrow(/lighthouse.skipAudits/)
  })

  test('the cdp runner needs no local Chrome; the local runner does', () => {
    const runner = parseConfig({ runner: { type: 'cdp', endpoint: 'ws://127.0.0.1:1/devtools/browser/x' } }).runner
    expect(checkAuditSetup({ runner, auth, chromePath: '/missing/chrome' })).toEqual({})
    expect(() => checkAuditSetup({ auth, chromePath: '/missing/chrome' })).toThrow(expect.objectContaining({ code: 'CHROME_NOT_FOUND' }))
    expect(() => checkAuditSetup({ runner, auth, lighthouse: { plugins: ['lighthouse-plugin-absent'] } }, tempDir('unlighthouse-empty-project-'))).toThrow(expect.objectContaining({ code: 'INVALID_CONFIG' }))
  })
})

describe('scans.start over the API', () => {
  const site = servePages(['/'])
  afterAll(() => site.stop())

  test('keeps audit filters but ignores plugins, settings and the runner; redacts remote Chrome credentials', async () => {
    const dir = tempDir('unlighthouse-lh-ops-')
    const store = openStore(join(dir, 'data'))
    const fake = createFakePool()
    const scanner = createScanner({
      store,
      bus: new EventBus(),
      createPool: fake.createPool,
      config: { runner: { type: 'cdp', endpoint: 'wss://user:secret@chrome.example.com/?token=secret', headers: { authorization: 'Bearer secret' } } },
    })
    try {
      const ctx = { store, scanner }
      const started = await invoke(operations, ctx, 'scans.start', {
        site: site.origin,
        lighthouse: { skipAudits: ['image-alt'], plugins: ['lighthouse-plugin-evil'], settings: { output: 'html' } },
        runner: { type: 'psi' },
      }) as { id: string, options: Record<string, any> }
      expect(started.options['lighthouse']).toEqual({ skipAudits: ['image-alt'] })
      expect(started.options['runner']).toMatchObject({ type: 'cdp', headers: { authorization: '[redacted]' } })
      expect(JSON.stringify(started.options)).not.toContain('secret')
      await invoke(operations, ctx, 'scans.wait', { scanId: started.id, timeoutMs: 10_000 })
      expect(fake.jobs[0]!.lighthouse).toEqual({ skipAudits: ['image-alt'] })
      expect(fake.jobs[0]!.runner).toMatchObject({ type: 'cdp', headers: { authorization: 'Bearer secret' } })
      await expect(invoke(operations, ctx, 'scans.start', { site: site.origin, lighthouse: { skipAudits: ['imge-alt'] } })).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
    }
    finally {
      await scanner.close()
      store.close()
    }
  })

  test('redacts extraHeaders from config settings in scan options', async () => {
    const dir = tempDir('unlighthouse-lh-headers-')
    const store = openStore(join(dir, 'data'))
    const fake = createFakePool()
    const scanner = createScanner({
      store,
      bus: new EventBus(),
      createPool: fake.createPool,
      config: { lighthouse: { settings: { extraHeaders: { Authorization: 'Bearer hdr-secret' }, locale: 'de' } } },
    })
    try {
      const ctx = { store, scanner }
      const started = await invoke(operations, ctx, 'scans.start', { site: site.origin }) as { id: string, options: Record<string, any> }
      expect(started.options['lighthouse']['settings']).toEqual({ extraHeaders: { Authorization: '[redacted]' }, locale: 'de' })
      const listed = await invoke(operations, ctx, 'scans.list', {}) as { items: unknown[] }
      expect(JSON.stringify(listed)).not.toContain('hdr-secret')
      await invoke(operations, ctx, 'scans.wait', { scanId: started.id, timeoutMs: 10_000 })
      expect(fake.jobs[0]!.lighthouse?.settings).toEqual({ extraHeaders: { Authorization: 'Bearer hdr-secret' }, locale: 'de' })
    }
    finally {
      await scanner.close()
      store.close()
    }
  })
})

describe('thumbnails', () => {
  test('come from the final screenshot as a small WebP', async () => {
    const shot = finalScreenshot(recorded)!
    expect(shot[0]).toBe(0xFF)
    expect(shot[1]).toBe(0xD8)
    const thumbnail = (await makeThumbnail(shot))!
    expect(isWebp(thumbnail)).toBe(true)
    expect((await new Bun.Image(thumbnail).metadata()).width).toBeLessThanOrEqual(THUMBNAIL_WIDTH)
    const lhr = structuredClone(recorded)
    delete (lhr.audits as Record<string, unknown>)['final-screenshot']
    expect(finalScreenshot(lhr)).toBeNull()
    expect(await makeThumbnail(new Uint8Array([1, 2, 3]))).toBeNull()
  })

  test('are stored per page and device, served with the report auth and long caching, and exported', async () => {
    const dir = tempDir('unlighthouse-thumbs-')
    const store = openStore(join(dir, 'data'))
    const scanner = createScanner({ store, bus: new EventBus(), createPool: createFakePool().createPool })
    const server = createServer({ store, scanner, bus: new EventBus(), port: 0, token: 'thumb-token-0123456789' })
    const url = 'https://example.com/'
    try {
      const scan = store.createScan({ origin: 'https://example.com', devices: ['mobile', 'desktop'], options: {} })
      store.insertPages(scan.id, [
        { url, path: '/', template: '/', device: 'mobile', status: 'queued' },
        { url, path: '/', template: '/', device: 'desktop', status: 'queued' },
      ])
      const thumbnail = (await makeThumbnail(finalScreenshot(recorded)))!
      const base = fakeResult({ ...job, url }, 0.9)
      store.savePageResult(scan.id, url, 'mobile', { ...base, thumbnail })
      store.savePageResult(scan.id, url, 'desktop', { ...base, thumbnail: null })
      store.updateScan(scan.id, { status: 'done' })
      expect(store.getThumbnail(scan.id, url, 'mobile')).toEqual(thumbnail)
      expect(store.getThumbnail(scan.id, url, 'desktop')).toBeNull()

      const path = `${server.url}/thumb/${scan.id}/mobile?url=${encodeURIComponent(url)}`
      expect((await fetch(path)).status).toBe(401)
      const response = await fetch(path, { headers: { authorization: 'Bearer thumb-token-0123456789' } })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/webp')
      expect(response.headers.get('cache-control')).toContain('max-age=31536000')
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(thumbnail))
      const etag = response.headers.get('etag')!
      expect((await fetch(path, { headers: { 'authorization': 'Bearer thumb-token-0123456789', 'if-none-match': etag } })).status).toBe(304)
      expect((await fetch(`${server.url}/thumb/${scan.id}/desktop?url=${encodeURIComponent(url)}`, { headers: { authorization: 'Bearer thumb-token-0123456789' } })).status).toBe(404)
      expect((await fetch(`${server.url}/thumb/${scan.id}/tablet?url=x`, { headers: { authorization: 'Bearer thumb-token-0123456789' } })).status).toBe(400)

      const out = join(dir, 'export')
      const exported = await exportScan({ store, scanId: scan.id, out, reports: false, version: 'test' })
      expect(exported.thumbnails).toBe(1)
      const data = readFileSync(join(out, 'data.js'), 'utf8')
      const snapshot = JSON.parse(data.slice(data.indexOf('{'), data.lastIndexOf('}') + 1)) as { thumbnails: Record<string, string> }
      const files = Object.values(snapshot.thumbnails)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^thumbs\/mobile-[0-9a-f]{16}\.webp$/)
      expect(new Uint8Array(readFileSync(join(out, files[0]!)))).toEqual(new Uint8Array(thumbnail))

      store.savePageResult(scan.id, url, 'mobile', { ...base, thumbnail: null })
      expect(store.getThumbnail(scan.id, url, 'mobile')).toBeNull()
      store.deleteScan(scan.id)
      expect(existsSync(join(dir, 'data', 'blobs', scan.id))).toBe(false)
    }
    finally {
      await server.stop()
      await scanner.close()
      store.close()
    }
  }, 60_000)
})
