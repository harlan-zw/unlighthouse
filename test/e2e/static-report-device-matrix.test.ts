// Phase 8 — Multi-device matrix: static report payload preserves device.
//
// The static report (built by `generateClient({ static: true })`) reads
// route rows from storage via `listForScan` and embeds them on the page as
// `window.__unlighthouse_payload`. When a scan exercises the matrix, every
// (url, device) row must round-trip into that payload — collapsing one
// device is the bug this test guards against.
//
// We seed a memory storage with two URLs scanned on both mobile + desktop
// (four rows), call `generateClient`, then parse the emitted payload.js
// and assert all four rows survive with their device tag intact. A
// single-device control case locks in the legacy shape for backwards
// compat: rows still carry `device`, just with one value.

import type { ExtractedMetrics } from '@unlighthouse/contracts/types/atoms'
import type { GenerateClientDeps } from '../../packages/unlighthouse/src/build'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { generateClient } from '../../packages/unlighthouse/src/build'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { testScanId, testUrl } from '../helpers/contracts'

const SCAN_ID = testScanId('scan-1')

interface Harness {
  tmp: string
  resolvedConfig: GenerateClientDeps['resolvedConfig']
  runtimeSettings: GenerateClientDeps['runtimeSettings']
  storage: ReturnType<typeof memoryStorage>
}

function metric(url: string, score: number): ExtractedMetrics {
  return {
    url: testUrl(url),
    path: new URL(url).pathname,
    routeName: null,
    scorePerformance: score,
    scoreAccessibility: score,
    scoreSeo: score,
    scoreBestPractices: score,
    lcp: 1234,
    cls: 0.01,
    inp: 100,
    fcp: 500,
    ttfb: 50,
    tbt: 10,
    si: 800,
    lighthouseVersion: '12.0.0',
    capturedAt: '2025-01-01T00:00:00.000Z',
  }
}

async function setup(): Promise<Harness> {
  const tmp = await mkdtemp(join(tmpdir(), 'unlighthouse-static-device-'))
  // generateClient copies the dir containing resolvedClientPath into
  // generatedClientPath, so the fixture needs an index.html.
  const clientSrc = join(tmp, 'client')
  const fs = await import('node:fs/promises')
  await fs.mkdir(clientSrc, { recursive: true })
  await writeFile(join(clientSrc, 'index.html'), '<html><head></head><body></body></html>', 'utf-8')
  await writeFile(join(clientSrc, '200.html'), '<html><head><script src="/_nuxt/entry.js"></script></head><body></body></html>', 'utf-8')
  await fs.mkdir(join(clientSrc, 'onboarding'), { recursive: true })
  await writeFile(join(clientSrc, 'onboarding', 'index.html'), '<html><head><link href="/_fonts/app.css"></head><body></body></html>', 'utf-8')

  const storage = memoryStorage()
  const resolvedConfig = {
    site: 'https://example.com',
    routerPrefix: '/',
    lighthouseOptions: { onlyCategories: ['performance'] },
    scanner: {},
    client: {},
  }

  const runtimeSettings = {
    resolvedClientPath: join(clientSrc, 'index.html'),
    generatedClientPath: join(tmp, 'generated'),
    currentScanId: SCAN_ID,
    apiUrl: 'http://localhost:5678/api',
    websocketUrl: 'ws://localhost:5678/api/ws',
  }

  return { tmp, resolvedConfig, runtimeSettings, storage }
}

async function readPayload(generated: string): Promise<{
  reports: Array<{ url: string, device?: string }>
  screenshots?: Record<string, Record<string, Partial<Record<'mobile' | 'desktop', string>>>>
}> {
  const raw = await readFile(join(generated, 'assets', 'payload.js'), 'utf-8')
  // payload.js is `window.__unlighthouse_payload = {...}` — strip the
  // assignment so we can parse the JSON directly.
  const json = raw.replace(/^window\.__unlighthouse_payload = /, '')
  return JSON.parse(json)
}

describe('static report — device matrix', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await setup()
  })

  afterEach(async () => {
    await rm(harness.tmp, { recursive: true, force: true })
  })

  it('injects runtime scripts into every HTML entry point', async () => {
    const { storage, resolvedConfig, runtimeSettings } = harness
    resolvedConfig.routerPrefix = '/audit/'

    await generateClient({ static: false }, { storage, resolvedConfig, runtimeSettings })

    for (const relativePath of ['index.html', '200.html', 'onboarding/index.html']) {
      const path = join(runtimeSettings.generatedClientPath, relativePath)
      const html = await readFile(path, 'utf-8')
      expect(html).toContain('<script src="/audit/assets/payload.js"></script>')
      expect(html).toContain('<script data-unlighthouse-inline>window.__unlighthouse_static = false</script>')
      expect(html).not.toMatch(/(?:href|src)="\/(?:assets|_nuxt|_fonts)\//)
    }
  })

  it('matrix scan: payload preserves one row per (url, device) with device tag', async () => {
    const { storage, resolvedConfig, runtimeSettings } = harness
    // Seed scan metadata so listForScan has something to read against.
    await storage.scans.create({
      scanId: SCAN_ID,
      site: testUrl('https://example.com'),
      mode: 'site',
      device: 'desktop',
      status: 'complete',
      startedAt: '2025-01-01T00:00:00.000Z',
      ciBranch: null,
      ciCommit: null,
      ciCommitMessage: null,
    })
    // Two URLs × two devices → four rows; perf differs per device so we
    // can see each one survives.
    await storage.routes.putBatch(SCAN_ID, 'mobile', [
      metric('https://example.com/', 0.85),
      metric('https://example.com/about', 0.78),
    ])
    await storage.routes.putBatch(SCAN_ID, 'desktop', [
      metric('https://example.com/', 0.97),
      metric('https://example.com/about', 0.95),
    ])

    await generateClient({ static: true }, { storage, resolvedConfig, runtimeSettings })

    const payload = await readPayload(runtimeSettings.generatedClientPath)
    expect(payload.reports).toHaveLength(4)
    // Every row tagged with device — matrix dimension survives the
    // payload-generation step.
    expect(payload.reports.every(r => r.device === 'mobile' || r.device === 'desktop')).toBe(true)
    const byUrl = new Map<string, string[]>()
    for (const r of payload.reports) {
      const arr = byUrl.get(r.url) ?? []
      arr.push(r.device!)
      byUrl.set(r.url, arr)
    }
    expect([...byUrl.get('https://example.com/')!].sort()).toEqual(['desktop', 'mobile'])
    expect([...byUrl.get('https://example.com/about')!].sort()).toEqual(['desktop', 'mobile'])
  })

  it('matrix scan: exports a distinct screenshot for each route device', async () => {
    const { storage, resolvedConfig, runtimeSettings } = harness
    await storage.scans.create({
      scanId: SCAN_ID,
      site: testUrl('https://example.com'),
      mode: 'site',
      device: 'desktop',
      status: 'complete',
      startedAt: '2025-01-01T00:00:00.000Z',
      ciBranch: null,
      ciCommit: null,
      ciCommitMessage: null,
    })
    await storage.blobs.put('screenshots/root-mobile.webp', new TextEncoder().encode('mobile'))
    await storage.blobs.put('screenshots/root-desktop.webp', new TextEncoder().encode('desktop'))
    await storage.routes.putBatch(SCAN_ID, 'mobile', [{
      ...metric('https://example.com/', 0.85),
      screenshotBlobKey: 'screenshots/root-mobile.webp',
    }])
    await storage.routes.putBatch(SCAN_ID, 'desktop', [{
      ...metric('https://example.com/', 0.97),
      screenshotBlobKey: 'screenshots/root-desktop.webp',
    }])

    await generateClient({ static: true }, { storage, resolvedConfig, runtimeSettings })

    const payload = await readPayload(runtimeSettings.generatedClientPath)
    const screenshots = payload.screenshots?.[SCAN_ID]?.['/']
    expect(screenshots?.mobile).toMatch(/^\/assets\/screenshots\/\d+\.webp$/)
    expect(screenshots?.desktop).toMatch(/^\/assets\/screenshots\/\d+\.webp$/)
    expect(screenshots?.mobile).not.toBe(screenshots?.desktop)
    expect(await readFile(join(runtimeSettings.generatedClientPath, screenshots!.mobile!.slice(1)), 'utf8')).toBe('mobile')
    expect(await readFile(join(runtimeSettings.generatedClientPath, screenshots!.desktop!.slice(1)), 'utf8')).toBe('desktop')
  })

  it('single-device scan: payload retains device tag (backwards-compat shape)', async () => {
    const { storage, resolvedConfig, runtimeSettings } = harness
    await storage.scans.create({
      scanId: SCAN_ID,
      site: testUrl('https://example.com'),
      mode: 'site',
      device: 'mobile',
      status: 'complete',
      startedAt: '2025-01-01T00:00:00.000Z',
      ciBranch: null,
      ciCommit: null,
      ciCommitMessage: null,
    })
    await storage.routes.putBatch(SCAN_ID, 'mobile', [
      metric('https://example.com/', 0.9),
      metric('https://example.com/about', 0.88),
    ])

    await generateClient({ static: true }, { storage, resolvedConfig, runtimeSettings })

    const payload = await readPayload(runtimeSettings.generatedClientPath)
    expect(payload.reports).toHaveLength(2)
    // Legacy single-device shape still carries device (always set on
    // ScanRoute), just with one consistent value.
    expect(payload.reports.every(r => r.device === 'mobile')).toBe(true)
  })
})
