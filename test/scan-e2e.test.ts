import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findChrome } from '../src/audit/chrome.ts'
import { openStore } from '../src/db/index.ts'
import { EventBus } from '../src/events.ts'
import { analyzeScan } from '../src/ops/analysis.ts'
import { createScanner } from '../src/scan/runner.ts'
import { renderReport } from '../src/server/app.ts'
import { servePages } from './fixtures/pages.ts'

const hasChrome = (() => {
  try {
    findChrome()
    return true
  }
  catch {
    return false
  }
})()

describe.skipIf(!hasChrome)('scan with real Chrome', () => {
  const site = servePages(['/', '/about', '/contact'])
  const dir = mkdtempSync(join(tmpdir(), 'unlighthouse-e2e-'))
  const store = openStore(join(dir, 'data'))
  const scanner = createScanner({ store, bus: new EventBus() })

  afterAll(async () => {
    await scanner.close()
    store.close()
    site.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  test('discovers and audits a three-page site end to end', async () => {
    const started = scanner.start({ site: site.origin, concurrency: 1 })
    const scan = await scanner.wait(started.id, 240_000)
    expect(scan.error).toBeNull()
    expect(scan.status).toBe('done')
    expect(scan.stats).toEqual({ discovered: 3, queued: 0, done: 3, failed: 0, skipped: 0 })
    expect(scan.lighthouseVersion).toMatch(/^13\./)

    const pages = store.allPages(scan.id)
    for (const page of pages) {
      expect(page.status).toBe('done')
      expect(page.scores.performance).toBeGreaterThan(0)
      expect(page.scores.seo).toBeGreaterThan(0)
      expect(page.metrics.lcp).toBeGreaterThan(0)
      expect(page.provenance).toMatchObject({ concurrency: 1, throttling: 'simulate' })
    }

    const summary = analyzeScan(store, scan.id).summary
    expect(summary.pages).toMatchObject({ discovered: 3, audited: 3, failed: 0 })

    const html = renderReport(store.getReport(scan.id, `${site.origin}/about`, 'mobile')!)
    expect(html).toContain('__LIGHTHOUSE_JSON__')
    expect(html).toContain(`${site.origin}/about`)
  }, 300_000)
})
