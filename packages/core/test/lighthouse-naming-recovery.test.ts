import type { LighthouseResult, ScanRoute } from '@unlighthouse/contracts'
import type { PackReconcileCtx } from '@unlighthouse/contracts/packs'
import { a11yQuickWinsPack, analyzeLabVsField, cwvPack, insightsPack, seoBasicsPack } from '@unlighthouse/core/packs'
import { extractRouteData, loadRouteContract, reconcileToContract } from '@unlighthouse/core/report'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'

const scanId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const url = 'https://example.com/'
function lhr(audits: LighthouseResult['audits'], category = 'performance'): LighthouseResult {
  return { requestedUrl: url, finalUrl: url, lighthouseVersion: '13.5.0', fetchTime: '2026-10-14T00:00:00Z', audits, categories: { [category]: { id: category, score: 0.5, auditRefs: Object.keys(audits).map(id => ({ id, weight: 1 })) } } } as LighthouseResult
}
function row(overrides: Partial<ScanRoute> = {}): ScanRoute {
  return { scanId, url, path: '/', device: 'mobile', lcp: 1200, cls: 0.02, inp: null, tbt: 100, fcp: 1000, si: 1500, ttfb: 100, capturedAt: '2026-10-14T00:00:00Z', ...overrides } as ScanRoute
}
function ctx(raw?: LighthouseResult): PackReconcileCtx {
  return { scanId, routes: [row()], getLhr: async () => raw ?? null, getReconciled: async () => raw ? reconcileToContract({ scanId, url, device: 'mobile', lhr: raw, auditor: 'local' }) : null } as PackReconcileCtx
}

describe('lighthouse result identity', () => {
  it('retains a failed native metricSavings insight through cross-page analysis', async () => {
    const raw = lhr({ 'font-display-insight': { id: 'font-display-insight', title: 'Font display', score: 0, scoreDisplayMode: 'metricSavings', metricSavings: { LCP: 150 } } })
    const report = await insightsPack.reconciler(ctx(raw))
    expect(report.insights.map(i => ({ id: i.id, title: i.title, savings: i.maxSingleRouteSavings })))
      .toEqual([{ id: 'font-display-insight', title: 'Font display', savings: { LCP: 150 } }])
  })

  it.each(['manual', 'informative', 'notApplicable', 'error'])('does not claim %s results passed', (mode) => {
    const contract = reconcileToContract({ scanId, url, device: 'mobile', lhr: lhr({ check: { id: 'check', score: null, scoreDisplayMode: mode } }) })
    expect(contract.audits.check.scoreDisplayMode).toBe(mode)
    expect(contract.audits.check.severity).toBeNull()
  })

  it('uses the producer title for a performance fix', async () => {
    const raw = lhr({ 'font-display-insight': { title: 'Font display', score: 0, scoreDisplayMode: 'metricSavings', metricSavings: { LCP: 150 } } })
    const report = await cwvPack.reconciler(ctx(raw))
    expect(report.topFixes[0]?.title).toBe('Font display')
  })

  it('describes missing performance measurements without a field assessment verdict', async () => {
    const report = await cwvPack.reconciler({ ...ctx(), routes: [row({ lcp: null })] })
    expect(report.metrics.find(m => m.metric === 'lcp')).toMatchObject({ source: 'unavailable', coverage: { eligible: 1, analysed: 0, missing: 1 }, p75: null })
    expect('passesCoreWebVitals' in report).toBe(false)
  })

  it('retains a failed accessibility audit without element detail', async () => {
    const raw = lhr({ 'color-contrast': { id: 'color-contrast', title: 'Contrast', score: 0, scoreDisplayMode: 'binary' } }, 'accessibility')
    const report = await a11yQuickWinsPack.reconciler(ctx(raw))
    expect(report.findings[0]).toMatchObject({ auditId: 'color-contrast', routeCount: 1, elementCount: 0 })
    expect(report.coverage).toEqual({ eligible: 1, analysed: 1, missing: 0 })
  })

  it('keeps missing category reports out of completed coverage', async () => {
    const report = await a11yQuickWinsPack.reconciler(ctx())
    expect(report.coverage).toEqual({ eligible: 1, analysed: 0, missing: 1 })
  })

  it('reports unknown crawlability when the required checks are absent', async () => {
    const raw = lhr({ 'document-title': { id: 'document-title', title: 'Title', score: 1, scoreDisplayMode: 'binary' } }, 'seo')
    const report = await seoBasicsPack.reconciler(ctx(raw))
    expect(report.routeChecks[0]).toMatchObject({ crawlability: 'unknown', missingChecks: 3 })
    expect(report.crawlabilityPercent).toBeNull()
  })

  it('recovers historical insight modes from the raw report without changing stored data', async () => {
    const raw = lhr({ 'font-display-insight': { id: 'font-display-insight', score: 0, scoreDisplayMode: 'metricSavings', metricSavings: { LCP: 150 } } })
    const legacy = reconcileToContract({ scanId, url, device: 'mobile', lhr: raw })
    delete legacy.schemaVersion
    legacy.audits['font-display-insight']!.scoreDisplayMode = 'informative'
    legacy.audits['font-display-insight']!.severity = 'pass'
    const storage = memoryStorage()
    const stored = new TextEncoder().encode(JSON.stringify(legacy))
    await storage.blobs.put('report.contract.json', stored)
    await storage.blobs.put('raw.gz', extractRouteData(raw).lhrGzip)
    const result = await loadRouteContract(storage.blobs, row({ reportBlobKey: 'report.json', lhrBlobKey: 'raw.gz', auditor: 'local' }))
    expect(result?.audits['font-display-insight']).toMatchObject({ scoreDisplayMode: 'metricSavings', severity: 'fail' })
    expect(await storage.blobs.get('report.contract.json')).toEqual(stored)
  })

  it('shows an unrecoverable historical mode as unknown', async () => {
    const legacy = reconcileToContract({ scanId, url, device: 'mobile', lhr: lhr({ check: { score: 0, scoreDisplayMode: 'metricSavings' } }) })
    delete legacy.schemaVersion
    legacy.audits.check!.scoreDisplayMode = 'informative'
    legacy.audits.check!.severity = 'pass'
    const storage = memoryStorage()
    await storage.blobs.put('report.contract.json', new TextEncoder().encode(JSON.stringify(legacy)))
    const result = await loadRouteContract(storage.blobs, row({ reportBlobKey: 'report.json', lhrBlobKey: null }))
    expect(result?.audits.check).toMatchObject({ scoreDisplayMode: 'unknown', severity: null })
  })

  it('keeps lab and field measurements distinguishable in a cross-URL summary', async () => {
    const secondUrl = `${url}field`
    const field = { _tag: 'field', auditor: 'crux', scope: 'origin', scopeUrl: url, collectionPeriod: { firstDate: '2026-09-01', lastDate: '2026-09-28' } }
    const raw = lhr({ 'largest-contentful-paint': { score: 0.9, scoreDisplayMode: 'numeric', numericValue: 1200 } })
    const report = await cwvPack.reconciler({ ...ctx(raw), routes: [row(), row({ url: secondUrl })], getReconciled: async target => reconcileToContract({ scanId, url: target, device: 'mobile', lhr: target === secondUrl ? { ...raw, performanceSource: field } : raw, auditor: target === secondUrl ? 'crux' : 'local' }) })
    expect(report.metrics.find(m => m.metric === 'lcp')).toMatchObject({ source: 'mixed', coverage: { eligible: 2, analysed: 2, missing: 0 }, sources: [{ _tag: 'lab' }, field] })
  })

  it('keeps field inputs out of lab-versus-field comparisons', () => {
    const field = { url, formFactor: 'PHONE', source: 'url', scopeUrl: url, collectionPeriod: null, lcp_p75: 5000, cls_p75: null, inp_p75: null, severity: 'poor' }
    const sources = new Map([[`mobile|${url}`, { _tag: 'field', auditor: 'crux', scope: 'url', scopeUrl: url, collectionPeriod: null }]])
    expect(analyzeLabVsField([row()], [field as never], sources as never)).toEqual({ goodLabPoorField: [], poorLabGoodField: [], aligned: [] })
  })

  it('ranks timing and CLS estimates separately', async () => {
    const raw = lhr({
      'font-display-insight': { title: 'Font display', score: 0, scoreDisplayMode: 'metricSavings', metricSavings: { LCP: 150 } },
      'cls-culprits-insight': { title: 'Layout shift culprits', score: 0, scoreDisplayMode: 'metricSavings', metricSavings: { CLS: 0.2 } },
    })
    const report = await insightsPack.reconciler(ctx(raw))
    expect(report.priorityOrderByMetric.LCP).toEqual(['font-display-insight'])
    expect(report.priorityOrderByMetric.CLS).toEqual(['cls-culprits-insight'])
    expect(report.insights.find(i => i.id === 'cls-culprits-insight')?.worstRoutesByMetric.CLS).toEqual([{ url, savings: 0.2 }])
  })

  it.each(['informative', 'manual', 'notApplicable', 'error', 'future-mode'])('does not turn %s insight data into a fix', async (mode) => {
    const raw = lhr({ 'font-display-insight': { title: 'Font display', score: 0, scoreDisplayMode: mode, metricSavings: { LCP: 150 } } })
    const reports = await Promise.all([insightsPack.reconciler(ctx(raw)), cwvPack.reconciler(ctx(raw))])
    expect(reports[0].insights).toEqual([])
    expect(reports[1].topFixes).toEqual([])
  })
})
