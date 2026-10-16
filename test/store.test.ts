import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AuditResult, NewPage, Store } from '../src/contracts.ts'
import { compareScans } from '../src/analysis/compare.ts'
import { openStore } from '../src/db/index.ts'
import { loadSide } from '../src/ops/analysis.ts'
import { MIGRATIONS } from '../src/db/migrations.ts'
import { UnlighthouseError } from '../src/errors.ts'
import type { Device, Finding } from '../src/types.ts'

const ORIGIN = 'https://example.com'

let dir: string
let store: Store

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unlighthouse-store-'))
  store = openStore(join(dir, 'data'))
})

afterEach(() => {
  store.close()
  setSystemTime()
  rmSync(dir, { recursive: true, force: true })
})

function page(path: string, device: Device = 'mobile', template = '/'): NewPage {
  return { url: `${ORIGIN}${path}`, path, template, device, status: 'queued' }
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    auditId: 'image-delivery-insight',
    category: 'performance',
    title: 'Improve image delivery',
    severity: 'fail',
    score: 0,
    displayValue: 'Est savings of 400 KiB',
    itemKey: '',
    itemLabel: null,
    savingsMs: null,
    savingsBytes: null,
    ...overrides,
  }
}

function result(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    finalUrl: `${ORIGIN}/`,
    statusCode: 200,
    scores: { 'performance': 0.5, 'accessibility': 0.9, 'best-practices': 1, 'seo': 0.8, 'agentic-browsing': null },
    metrics: { fcp: 1200, lcp: 2500, tbt: 300, cls: 0.1, si: 2000, ttfb: null },
    provenance: { lighthouseVersion: '13.5.0', benchmarkIndex: 1500, throttling: 'simulate', concurrency: 2, samples: 1, spread: null, warnings: [] },
    findings: [],
    report: Bun.gzipSync(JSON.stringify({ lighthouseVersion: '13.5.0' })),
    thumbnail: null,
    durationMs: 8000,
    ...overrides,
  }
}

function newScan(devices: Device[] = ['mobile'], extra: { branch?: string } = {}) {
  return store.createScan({ origin: ORIGIN, devices, options: { samples: 1 }, ...extra })
}

describe('store', () => {
  test('creates the data dir, database and schema version', () => {
    expect(existsSync(join(dir, 'data', 'unlighthouse.db'))).toBe(true)
    const db = new Database(join(dir, 'data', 'unlighthouse.db'), { readonly: true })
    expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length)
    expect((db.query('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('wal')
    db.close()
  })

  test('reopening keeps data and does not re-run migrations', () => {
    const scan = newScan()
    store.close()
    store = openStore(join(dir, 'data'))
    store.close()
    store = openStore(join(dir, 'data'))
    expect(store.getScan(scan.id)?.id).toBe(scan.id)
    expect(store.listSites()).toHaveLength(1)
  })

  test('round-trips sites and scans', () => {
    const site = store.upsertSite(ORIGIN)
    expect(store.upsertSite(ORIGIN).id).toBe(site.id)
    const scan = store.createScan({ origin: ORIGIN, devices: ['mobile', 'desktop'], options: { samples: 3 }, label: 'nightly', branch: 'main', commit: 'abc123' })
    expect(scan).toMatchObject({
      siteId: site.id,
      origin: ORIGIN,
      status: 'queued',
      label: 'nightly',
      branch: 'main',
      commit: 'abc123',
      devices: ['mobile', 'desktop'],
      options: { samples: 3 },
      stats: { discovered: 0, queued: 0, done: 0, failed: 0, skipped: 0 },
      lighthouseVersion: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    })
    const broken = [{ url: `${ORIGIN}/gone`, status: 404, from: `${ORIGIN}/` }]
    store.updateScan(scan.id, { status: 'done', stats: { discovered: 3, queued: 0, done: 2, failed: 1, skipped: 0 }, lighthouseVersion: '13.5.0', startedAt: 10, finishedAt: 20, brokenLinks: broken })
    expect(store.getScan(scan.id)).toMatchObject({ status: 'done', stats: { done: 2, failed: 1 }, lighthouseVersion: '13.5.0', startedAt: 10, finishedAt: 20 })
    expect(store.brokenLinks(scan.id)).toEqual(broken)
    expect(store.getScan('missing')).toBeNull()
    expect(() => store.updateScan('missing', { status: 'done' })).toThrow(UnlighthouseError)
  })

  test('lists scans newest first and sites with count and latest scan', () => {
    setSystemTime(1000)
    const first = newScan()
    setSystemTime(2000)
    const second = newScan()
    setSystemTime(3000)
    const other = store.createScan({ origin: 'https://other.dev', devices: ['mobile'], options: {} })
    store.updateScan(second.id, { status: 'done' })

    expect(store.listScans({ limit: 10, offset: 0 }).items.map(scan => scan.id)).toEqual([other.id, second.id, first.id])
    const page = store.listScans({ origin: ORIGIN, limit: 1, offset: 1 })
    expect(page.total).toBe(2)
    expect(page.items.map(scan => scan.id)).toEqual([first.id])
    expect(store.listScans({ status: 'done', limit: 10, offset: 0 }).items.map(scan => scan.id)).toEqual([second.id])

    const sites = store.listSites()
    expect(sites.map(site => [site.origin, site.scans, site.lastScan?.id])).toEqual([
      [ORIGIN, 2, second.id],
      ['https://other.dev', 1, other.id],
    ])
  })

  test('saves a page result with findings and report in one step', () => {
    const scan = newScan()
    store.insertPages(scan.id, [page('/')])
    store.setPageStatus(scan.id, `${ORIGIN}/`, 'mobile', 'running')
    const report = Bun.gzipSync(JSON.stringify({ audits: {} }))
    const findings = [finding({ itemKey: `${ORIGIN}/hero.jpg`, itemLabel: 'hero.jpg', savingsBytes: 400_000 }), finding({ auditId: 'color-contrast', category: 'accessibility', severity: 'warn', title: 'Contrast' })]
    store.savePageResult(scan.id, `${ORIGIN}/`, 'mobile', result({ findings, report }))

    const saved = store.getPage(scan.id, `${ORIGIN}/`, 'mobile')!
    expect(saved).toMatchObject({
      status: 'done',
      path: '/',
      template: '/',
      finalUrl: `${ORIGIN}/`,
      statusCode: 200,
      error: null,
      durationMs: 8000,
      scores: { 'performance': 0.5, 'agentic-browsing': null },
      metrics: { lcp: 2500, ttfb: null },
      provenance: { lighthouseVersion: '13.5.0', benchmarkIndex: 1500 },
    })
    expect(saved.finishedAt).toBeNumber()
    expect(store.findings(scan.id, `${ORIGIN}/`, 'mobile')).toEqual(findings)
    expect(store.getReport(scan.id, `${ORIGIN}/`, 'mobile')).toEqual(new Uint8Array(report))
    expect(store.getReport(scan.id, `${ORIGIN}/`, 'desktop')).toBeNull()

    store.savePageResult(scan.id, `${ORIGIN}/`, 'mobile', result({ findings: [finding({ auditId: 'seo-title' })] }))
    expect(store.findings(scan.id, `${ORIGIN}/`, 'mobile').map(item => item.auditId)).toEqual(['seo-title'])
  })

  test('saving a result for an unknown page changes nothing', () => {
    const scan = newScan()
    expect(() => store.savePageResult(scan.id, `${ORIGIN}/nope`, 'mobile', result({ findings: [finding()] }))).toThrow(UnlighthouseError)
    expect(store.getReport(scan.id, `${ORIGIN}/nope`, 'mobile')).toBeNull()
    expect(existsSync(join(dir, 'data', 'blobs', scan.id))).toBe(false)
  })

  test('records failed pages with their error', () => {
    const scan = newScan()
    store.insertPages(scan.id, [page('/'), page('/')])
    store.setPageStatus(scan.id, `${ORIGIN}/`, 'mobile', 'failed', 'Chrome crashed')
    expect(store.getPage(scan.id, `${ORIGIN}/`, 'mobile')).toMatchObject({ status: 'failed', error: 'Chrome crashed' })
    expect(store.allPages(scan.id)).toHaveLength(1)
    expect(() => store.setPageStatus(scan.id, `${ORIGIN}/x`, 'mobile', 'running')).toThrow(UnlighthouseError)
  })

  test('lists pages filtered and sorted with nulls last', () => {
    const scan = newScan(['mobile', 'desktop'])
    store.insertPages(scan.id, [page('/a', 'mobile', '/a'), page('/b', 'mobile', '/b/*'), page('/c', 'mobile', '/b/*'), page('/d', 'mobile', '/b/*'), page('/a', 'desktop', '/a')])
    const lcp: Record<string, number | null> = { '/a': 3000, '/b': null, '/c': 1000 }
    for (const [path, value] of Object.entries(lcp))
      store.savePageResult(scan.id, `${ORIGIN}${path}`, 'mobile', result({ metrics: { fcp: null, lcp: value, tbt: null, cls: null, si: null, ttfb: null } }))

    const sorted = (order: 'asc' | 'desc') => store.listPages({ scanId: scan.id, device: 'mobile', sort: 'lcp', order, limit: 10, offset: 0 }).items.map(item => item.path)
    expect(sorted('asc')).toEqual(['/c', '/a', '/b', '/d'])
    expect(sorted('desc')).toEqual(['/a', '/c', '/b', '/d'])

    const byTemplate = store.listPages({ scanId: scan.id, template: '/b/*', status: 'done', sort: 'performance', limit: 1, offset: 1 })
    expect(byTemplate.total).toBe(2)
    expect(byTemplate.items.map(item => item.path)).toEqual(['/c'])
    expect(store.listPages({ scanId: scan.id, search: '/a', limit: 10, offset: 0 }).items.map(item => item.device)).toEqual(['desktop', 'mobile'])
    expect(store.listPages({ scanId: scan.id, search: '%', limit: 10, offset: 0 }).total).toBe(0)
  })

  test('aggregates findings into issues ranked by impact', () => {
    const scan = newScan(['mobile', 'desktop'])
    store.insertPages(scan.id, [page('/a', 'mobile', '/a'), page('/b', 'mobile', '/b/*'), page('/c', 'mobile', '/b/*'), page('/a', 'desktop', '/a')])
    const hero = { auditId: 'image-delivery-insight', itemKey: `${ORIGIN}/hero.jpg`, itemLabel: 'hero.jpg' }
    const save = (path: string, device: Device, findings: Finding[]) => store.savePageResult(scan.id, `${ORIGIN}${path}`, device, result({ findings }))
    save('/a', 'mobile', [finding({ ...hero, savingsBytes: 200_000, savingsMs: 500 }), finding({ auditId: 'color-contrast', category: 'accessibility', severity: 'warn', title: 'Contrast' })])
    save('/b', 'mobile', [finding({ ...hero, savingsBytes: 200_000 }), finding({ auditId: 'color-contrast', category: 'accessibility', severity: 'fail', title: 'Contrast' })])
    save('/c', 'mobile', [finding({ ...hero, severity: 'warn', savingsBytes: 200_000 })])
    save('/a', 'desktop', [finding({ ...hero, savingsBytes: 100_000 }), finding({ auditId: 'meta-description', category: 'seo', severity: 'warn', title: 'Meta' })])

    const issues = store.listIssues({ scanId: scan.id, limit: 10, offset: 0 })
    expect(issues.total).toBe(3)
    expect(issues.items.map(issue => issue.auditId)).toEqual(['image-delivery-insight', 'color-contrast', 'meta-description'])
    expect(issues.items[0]).toEqual({
      auditId: 'image-delivery-insight',
      category: 'performance',
      title: 'Improve image delivery',
      severity: 'fail',
      pages: 3,
      items: 1,
      topItems: [{ key: `${ORIGIN}/hero.jpg`, label: 'hero.jpg', pages: 3, savingsMs: 500, savingsBytes: 700_000 }],
      devices: ['desktop', 'mobile'],
      templates: ['/a', '/b/*'],
      savingsMs: 500,
      savingsBytes: 700_000,
      impact: 3 + 0.5 + 7,
      examples: [`${ORIGIN}/a`, `${ORIGIN}/b`, `${ORIGIN}/c`],
    })
    expect(issues.items[1]).toMatchObject({ severity: 'fail', pages: 2, impact: 2 })
    expect(issues.items[2]).toMatchObject({ severity: 'warn', pages: 1, impact: 0.5, devices: ['desktop'] })

    expect(store.listIssues({ scanId: scan.id, category: 'seo', limit: 10, offset: 0 }).items.map(issue => issue.auditId)).toEqual(['meta-description'])
    const desktop = store.listIssues({ scanId: scan.id, device: 'desktop', limit: 10, offset: 0 })
    expect(desktop.items[0]).toMatchObject({ pages: 1, savingsBytes: 100_000, devices: ['desktop'] })
    const template = store.listIssues({ scanId: scan.id, template: '/b/*', limit: 1, offset: 0 })
    expect(template.total).toBe(2)
    expect(template.items[0]).toMatchObject({ auditId: 'image-delivery-insight', pages: 2, templates: ['/b/*'], examples: [`${ORIGIN}/b`, `${ORIGIN}/c`] })

    const affected = store.issuePages(scan.id, hero.auditId)
    expect(affected).toHaveLength(4)
    expect(affected[0]).toEqual({ url: `${ORIGIN}/a`, device: 'mobile', template: '/a', items: 1, savingsMs: 500, savingsBytes: 200_000, displayValue: 'Est savings of 400 KiB' })
    expect(store.issuePages(scan.id, 'color-contrast').map(item => item.url)).toEqual([`${ORIGIN}/a`, `${ORIGIN}/b`])
    expect(store.listIssues({ scanId: scan.id, auditId: 'color-contrast', limit: 10, offset: 0 }).items[0]).toMatchObject({ pages: 2, items: 0, topItems: [] })
    expect(store.issueItems(scan.id, 'color-contrast')).toEqual([])
  })

  test('merges the hashed bundles of one audit into one issue, counting each page once with its largest saving', () => {
    const scan = newScan()
    store.insertPages(scan.id, [page('/a'), page('/b'), page('/c')])
    const js = (hash: string, savingsBytes: number) => finding({ auditId: 'unused-javascript', title: 'Reduce unused JavaScript', itemKey: `${ORIGIN}/_nuxt/${hash}.js`, itemLabel: `/_nuxt/${hash}.js`, savingsBytes, savingsMs: savingsBytes / 1000 })
    const save = (path: string, findings: Finding[]) => store.savePageResult(scan.id, `${ORIGIN}${path}`, 'mobile', result({ findings }))
    save('/a', [js('RWi7wTWu', 100_000), js('Y9VT7vHg', 50_000)])
    save('/b', [js('RWi7wTWu', 100_000)])
    save('/c', [js('Kq2xP0aB', 30_000)])

    const issues = store.listIssues({ scanId: scan.id, limit: 10, offset: 0 })
    expect(issues.total).toBe(1)
    expect(issues.items[0]).toMatchObject({
      auditId: 'unused-javascript',
      pages: 3,
      items: 3,
      savingsBytes: 230_000,
      savingsMs: 230,
      impact: 3 + 0.23 + 2.3,
    })
    expect(issues.items[0]!.topItems.map(item => [item.key, item.pages, item.savingsBytes])).toEqual([
      [`${ORIGIN}/_nuxt/RWi7wTWu.js`, 2, 200_000],
      [`${ORIGIN}/_nuxt/Y9VT7vHg.js`, 1, 50_000],
      [`${ORIGIN}/_nuxt/Kq2xP0aB.js`, 1, 30_000],
    ])

    expect(store.issueItems(scan.id, 'unused-javascript').map(item => item.label)).toEqual(['/_nuxt/RWi7wTWu.js', '/_nuxt/Y9VT7vHg.js', '/_nuxt/Kq2xP0aB.js'])
    expect(store.issuePages(scan.id, 'unused-javascript').map(entry => [entry.url, entry.items, entry.savingsBytes])).toEqual([
      [`${ORIGIN}/a`, 2, 100_000],
      [`${ORIGIN}/b`, 1, 100_000],
      [`${ORIGIN}/c`, 1, 30_000],
    ])
  })

  test('comparing scans whose bundle hashes changed reports the audit as persisting, not new and fixed', () => {
    const scanWith = (hashes: string[]) => {
      const scan = newScan()
      store.insertPages(scan.id, [page('/a'), page('/b')])
      for (const path of ['/a', '/b']) {
        store.savePageResult(scan.id, `${ORIGIN}${path}`, 'mobile', result({
          findings: hashes.map(hash => finding({ auditId: 'unused-javascript', itemKey: `${ORIGIN}/_nuxt/${hash}.js`, savingsBytes: 40_000 })),
        }))
      }
      store.updateScan(scan.id, { status: 'done' })
      return store.getScan(scan.id)!
    }
    const base = scanWith(['RWi7wTWu', 'Y9VT7vHg'])
    const head = scanWith(['Pq81LmZa', 'c0FfEe12', 'Xy7Hn3Qk'])
    const comparison = compareScans(loadSide(store, base), loadSide(store, head))
    expect(comparison.totals.issues).toEqual({ new: 0, fixed: 0, persisting: 1, unknown: 0 })
    expect(comparison.issues.persisting[0]).toMatchObject({ auditId: 'unused-javascript', basePages: 2, headPages: 2, pagesDelta: 0, items: 3 })
  })

  test('lists the templates of a scan with distinct page counts, largest first', () => {
    const scan = newScan(['mobile', 'desktop'])
    store.insertPages(scan.id, [
      page('/blog/a', 'mobile', '/blog/*'),
      page('/blog/a', 'desktop', '/blog/*'),
      page('/blog/b', 'mobile', '/blog/*'),
      page('/about', 'mobile', '/about'),
      page('/', 'mobile', '/'),
      page('/', 'desktop', '/'),
    ])
    expect(store.templates(scan.id)).toEqual([
      { template: '/blog/*', pages: 2 },
      { template: '/', pages: 1 },
      { template: '/about', pages: 1 },
    ])
    expect(store.templates('missing')).toEqual([])
  })

  test('finds the baseline by origin, devices and branch preference', () => {
    const at = (time: number, devices: Device[], branch?: string, status: 'done' | 'failed' = 'done') => {
      setSystemTime(time)
      const scan = newScan(devices, branch === undefined ? {} : { branch })
      store.updateScan(scan.id, { status })
      return scan
    }
    const mainOld = at(1000, ['mobile', 'desktop'], 'main')
    const feature = at(2000, ['mobile'], 'feature')
    at(3000, ['mobile'], 'main', 'failed')
    const desktopOnly = at(4000, ['desktop'], 'main')
    setSystemTime(5000)
    const other = store.createScan({ origin: 'https://other.dev', devices: ['mobile'], options: {} })
    store.updateScan(other.id, { status: 'done' })
    const current = at(6000, ['mobile'], 'feature', 'failed')

    const base = { origin: ORIGIN, excludeId: current.id, before: current.createdAt }
    expect(store.findBaseline({ ...base, devices: ['mobile'], branch: 'main' })?.id).toBe(mainOld.id)
    expect(store.findBaseline({ ...base, devices: ['mobile'] })?.id).toBe(feature.id)
    expect(store.findBaseline({ ...base, devices: ['mobile'], branch: 'release' })?.id).toBe(feature.id)
    expect(store.findBaseline({ ...base, devices: ['mobile', 'desktop'], branch: 'feature' })?.id).toBe(mainOld.id)
    expect(store.findBaseline({ ...base, devices: ['desktop'] })?.id).toBe(desktopOnly.id)
    expect(store.findBaseline({ ...base, devices: ['mobile'], before: 2000 })?.id).toBe(mainOld.id)
    expect(store.findBaseline({ ...base, devices: ['mobile'], excludeId: feature.id, branch: 'feature' })?.id).toBe(mainOld.id)
    expect(store.findBaseline({ ...base, devices: ['mobile'], before: 1000 })).toBeNull()
  })

  test('deleting and pruning scans removes rows and blobs', () => {
    const scans = [1000, 2000, 3000].map((time) => {
      setSystemTime(time)
      const scan = newScan()
      store.insertPages(scan.id, [page('/')])
      store.savePageResult(scan.id, `${ORIGIN}/`, 'mobile', result({ findings: [finding()] }))
      store.updateScan(scan.id, { status: 'done' })
      return scan
    })
    const blobDir = (id: string) => join(dir, 'data', 'blobs', id)
    expect(existsSync(blobDir(scans[0]!.id))).toBe(true)

    store.deleteScan(scans[2]!.id)
    expect(store.getScan(scans[2]!.id)).toBeNull()
    expect(store.allPages(scans[2]!.id)).toEqual([])
    expect(store.findings(scans[2]!.id, `${ORIGIN}/`, 'mobile')).toEqual([])
    expect(existsSync(blobDir(scans[2]!.id))).toBe(false)
    store.deleteScan(scans[2]!.id)

    expect(store.pruneScans(ORIGIN, 1)).toEqual([scans[0]!.id])
    expect(store.listScans({ limit: 10, offset: 0 }).items.map(scan => scan.id)).toEqual([scans[1]!.id])
    expect(existsSync(blobDir(scans[0]!.id))).toBe(false)
    expect(existsSync(blobDir(scans[1]!.id))).toBe(true)
    expect(store.pruneScans(ORIGIN, 1)).toEqual([])
  })

  test('pruning never removes an active scan or the latest finished baseline', () => {
    const at = (time: number, status: 'queued' | 'auditing' | 'done' | 'failed' | 'cancelled') => {
      setSystemTime(time)
      const scan = newScan()
      store.updateScan(scan.id, { status })
      return scan
    }
    const oldDone = at(1000, 'done')
    const baseline = at(2000, 'done')
    const failed = at(3000, 'failed')
    const cancelled = at(4000, 'cancelled')
    const running = at(5000, 'auditing')
    const queued = at(6000, 'queued')
    expect(store.pruneScans(ORIGIN, 1).sort()).toEqual([oldDone.id, failed.id].sort())
    expect(store.listScans({ limit: 10, offset: 0 }).items.map(scan => scan.id)).toEqual([queued.id, running.id, cancelled.id, baseline.id])
    expect(store.pruneScans(ORIGIN, 0).sort()).toEqual([baseline.id, cancelled.id].sort())
    expect(store.listScans({ limit: 10, offset: 0 }).items.map(scan => scan.id)).toEqual([queued.id, running.id])
  })

  test('page listing and issue grouping use indexes', () => {
    store.close()
    const db = new Database(join(dir, 'data', 'unlighthouse.db'), { readonly: true })
    const plan = (sql: string) => (db.query(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>).map(row => row.detail).join('\n')
    expect(plan(`SELECT * FROM pages WHERE scan_id = 'x' AND device = 'mobile' AND status = 'done' ORDER BY metric_lcp ASC NULLS LAST, url, device LIMIT 50`))
      .toContain('SEARCH pages USING INDEX pages_device (scan_id=? AND device=? AND status=?)')
    expect(plan(`SELECT * FROM pages WHERE scan_id = 'x' AND template = '/b/*' AND device = 'mobile' ORDER BY score_performance DESC NULLS LAST`))
      .toContain('SEARCH pages USING INDEX pages_template (scan_id=? AND template=? AND device=?)')
    expect(plan(`SELECT * FROM pages WHERE scan_id = 'x' ORDER BY url LIMIT 50`)).not.toContain('SCAN pages')
    const issues = plan(`SELECT f.audit_id, f.url, f.device, max(f.savings_ms) FROM findings f
      JOIN pages p ON p.scan_id = f.scan_id AND p.url = f.url AND p.device = f.device
      WHERE f.scan_id = 'x' GROUP BY f.audit_id, f.url, f.device`)
    expect(issues).toMatch(/SEARCH f USING (COVERING )?INDEX findings_issue/)
    const items = plan(`SELECT f.item_key, count(DISTINCT f.url) FROM findings f
      WHERE f.scan_id = 'x' AND f.audit_id = 'unused-javascript' AND f.item_key <> '' GROUP BY f.item_key`)
    expect(items).toMatch(/SEARCH f USING (COVERING )?INDEX findings_issue \(scan_id=\? AND audit_id=\?/)
    expect(items).not.toContain('TEMP B-TREE FOR GROUP BY')
    db.close()
    store = openStore(join(dir, 'data'))
  })
})
