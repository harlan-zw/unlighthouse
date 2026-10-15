import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { Result } from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import { explainChromeFailure, findChrome } from '../src/audit/chrome.ts'
import { installedCategories, lighthouseConfig, lighthouseFlags } from '../src/audit/lighthouse.ts'
import { medianRun, reconcile, sampleSpread } from '../src/audit/reconcile.ts'
import type { AuditJob } from '../src/contracts.ts'
import { UnlighthouseError } from '../src/errors.ts'
import { renderReport } from '../src/server/app.ts'
import { CATEGORIES } from '../src/types.ts'

const recorded = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(await Bun.file(join(import.meta.dir, 'fixtures/lhr-mobile.json.gz')).bytes()))) as Result

function fixture(): Result {
  return structuredClone(recorded)
}

const job: AuditJob = {
  url: recorded.requestedUrl ?? recorded.finalDisplayedUrl,
  device: 'mobile',
  categories: [...CATEGORIES],
  throttling: 'simulate',
  samples: 3,
  timeoutMs: 90_000,
  concurrency: 2,
  chromeFlags: [],
  auth: { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} },
}

const origin = new URL(job.url).origin

describe('reconcile', () => {
  const result = reconcile(fixture(), job, 0.04)

  test('reads category scores and leaves missing categories null', () => {
    expect(result.scores.performance).toBeGreaterThan(0)
    expect(result.scores.performance).toBeLessThan(0.9)
    expect(result.scores.accessibility).toBeLessThan(1)
    expect(result.scores.seo).toBeLessThan(1)
    const withoutSeo = fixture()
    delete withoutSeo.categories['seo']
    expect(reconcile(withoutSeo, job, null).scores.seo).toBeNull()
  })

  test('reads lab metrics including TTFB of the main document', () => {
    for (const metric of ['fcp', 'lcp', 'tbt', 'cls', 'si', 'ttfb'] as const)
      expect(typeof result.metrics[metric]).toBe('number')
    expect(result.metrics.lcp!).toBeGreaterThan(result.metrics.fcp!)
    expect(result.metrics.ttfb!).toBeGreaterThan(0)
    expect(result.metrics.ttfb!).toBeLessThan(result.metrics.fcp!)
  })

  test('records provenance from the run and the job', () => {
    expect(result.provenance).toMatchObject({ lighthouseVersion: '13.5.0', throttling: 'simulate', concurrency: 2, samples: 3, spread: 0.04 })
    expect(result.provenance.benchmarkIndex).toBeGreaterThan(0)
    expect(result.finalUrl).toBe(`${origin}/`)
    expect(result.statusCode).toBe(200)
  })

  test('adds run warnings and the runtime error to provenance warnings', () => {
    const lhr = fixture()
    lhr.runWarnings = ['The page loaded too slowly']
    lhr.runtimeError = { code: 'NO_FCP', message: 'The page did not paint any content.' }
    expect(reconcile(lhr, job, null).provenance.warnings).toEqual(['The page loaded too slowly', 'NO_FCP: The page did not paint any content.'])
  })

  test('turns each failing element, resource and source into its own finding', () => {
    const imageAlt = result.findings.filter(f => f.auditId === 'image-alt')
    expect(imageAlt).toEqual([expect.objectContaining({ category: 'accessibility', severity: 'fail', itemKey: 'body > img', itemLabel: 'body > img' })])

    const blocking = result.findings.find(f => f.auditId === 'render-blocking-insight')
    expect(blocking).toMatchObject({ category: 'performance', itemKey: `${origin}/blocking.js`, itemLabel: `${new URL(origin).host}/blocking.js` })
    expect(blocking!.savingsMs!).toBeGreaterThanOrEqual(250)

    const image = result.findings.find(f => f.auditId === 'image-delivery-insight')
    expect(image).toMatchObject({ itemKey: `${origin}/hero.png` })
    expect(image!.savingsBytes!).toBeGreaterThan(1_000_000)
    expect(image!.savingsMs!).toBeGreaterThan(0)

    const consoleError = result.findings.find(f => f.auditId === 'errors-in-console')
    expect(consoleError?.itemKey).toBe(`${origin}/favicon.ico:0:0`)
  })

  test('keeps audits without items as one audit-level finding', () => {
    expect(result.findings.filter(f => f.auditId === 'meta-description')).toEqual([
      expect.objectContaining({ category: 'seo', severity: 'fail', itemKey: '', itemLabel: null, savingsMs: null, savingsBytes: null }),
    ])
  })

  test('skips metrics, hidden, passing, informative, not applicable and manual audits', () => {
    const ids = new Set(result.findings.map(f => f.auditId))
    for (const id of ['largest-contentful-paint', 'speed-index', 'first-contentful-paint', 'interactive', 'network-requests', 'document-latency-insight', 'structured-data', 'llms-txt', 'diagnostics', 'html-has-lang'])
      expect(ids.has(id)).toBe(false)
    for (const finding of result.findings) {
      expect(finding.score!).toBeLessThan(0.9)
      expect(finding.severity).toBe(finding.score! < 0.5 ? 'fail' : 'warn')
    }
  })

  test('only reports audits of the job categories', () => {
    const seoOnly = reconcile(fixture(), { ...job, categories: ['seo'] }, null)
    expect(seoOnly.findings.length).toBeGreaterThan(0)
    expect(seoOnly.findings.every(f => f.category === 'seo')).toBe(true)
  })

  test('marks scores between 0.5 and 0.9 as warnings', () => {
    const lhr = fixture()
    lhr.audits['meta-description']!.score = 0.7
    expect(reconcile(lhr, job, null).findings.find(f => f.auditId === 'meta-description')?.severity).toBe('warn')
  })

  test('reports failing checklist entries and caps items per audit', () => {
    const lhr = fixture()
    const latency = lhr.audits['document-latency-insight']!
    latency.score = 0
    latency.metricSavings = { FCP: 120, LCP: 480 }
    latency.details = {
      type: 'checklist',
      items: {
        noRedirects: { label: 'Avoids redirects', value: true },
        usesCompression: { label: 'Applies text compression', value: false },
      },
    }
    const blocking = lhr.audits['render-blocking-insight']!
    blocking.details = {
      type: 'table',
      headings: [{ key: 'url', valueType: 'url', label: 'URL' }],
      items: Array.from({ length: 30 }, (_, i) => ({ url: `${origin}/script-${i}.js`, wastedMs: 10 })),
    }
    const findings = reconcile(lhr, job, null).findings
    expect(findings.filter(f => f.auditId === 'document-latency-insight')).toEqual([
      expect.objectContaining({ itemKey: 'usesCompression', itemLabel: 'Applies text compression', savingsMs: 480 }),
    ])
    const scripts = findings.filter(f => f.auditId === 'render-blocking-insight')
    expect(scripts).toHaveLength(20)
    expect(new Set(scripts.map(f => f.itemKey)).size).toBe(20)
  })

  test('reads agentic-browsing audits', () => {
    const lhr = fixture()
    const llms = lhr.audits['llms-txt']!
    llms.score = 0
    llms.scoreDisplayMode = 'binary'
    const finding = reconcile(lhr, job, null).findings.find(f => f.auditId === 'llms-txt')
    expect(finding).toMatchObject({ category: 'agentic-browsing', severity: 'fail', itemKey: '' })
  })

  test('produces stable findings for the same report', () => {
    expect(reconcile(fixture(), job, null).findings).toEqual(reconcile(fixture(), job, null).findings)
  })
})

describe('samples', () => {
  function run(score: number, fcp: number, tti: number): Result {
    const lhr = fixture()
    lhr.categories['performance']!.score = score
    lhr.audits['first-contentful-paint']!.numericValue = fcp
    lhr.audits['interactive']!.numericValue = tti
    return lhr
  }

  test('keeps the run Lighthouse considers the median and measures the spread', () => {
    const runs = [run(0.5, 3000, 9000), run(0.7, 2000, 6000), run(0.9, 1000, 3000)]
    expect(performanceOf(medianRun(runs))).toBe(0.7)
    expect(sampleSpread(runs)).toBe(0.4)
    expect(sampleSpread([runs[0]!])).toBeNull()
  })

  function performanceOf(lhr: Result) {
    return lhr.categories['performance']?.score
  }
})

describe('lighthouse settings', () => {
  test('every Unlighthouse category exists in the installed Lighthouse config', () => {
    expect(installedCategories()).toEqual(expect.arrayContaining([...CATEGORIES]))
  })

  test('uses the upstream configs per device', () => {
    expect(lighthouseConfig({ device: 'mobile' })).toBeUndefined()
    expect(lighthouseConfig({ device: 'desktop' })).toBe(desktopConfig)
  })

  test('leaves the simulate preset untouched and only sets what the job asks for', () => {
    const flags = lighthouseFlags(job)
    expect(flags).toEqual({ output: 'json', logLevel: 'error', onlyCategories: [...CATEGORIES], throttlingMethod: 'simulate' })
  })

  test('maps devtools and none throttling', () => {
    expect(lighthouseFlags({ ...job, throttling: 'devtools' })).toMatchObject({ throttlingMethod: 'devtools' })
    expect(lighthouseFlags({ ...job, throttling: 'devtools' }).throttling).toBeUndefined()
    expect(lighthouseFlags({ ...job, throttling: 'none' })).toMatchObject({
      throttlingMethod: 'provided',
      throttling: { rttMs: 0, throughputKbps: 0, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0, cpuSlowdownMultiplier: 1 },
    })
  })

  test('passes the user agent through and never auth headers, which Lighthouse sends to every origin and stores in the report', () => {
    const flags = lighthouseFlags({ ...job, userAgent: 'UnlighthouseBot/1', auth: { ...job.auth, headers: { authorization: 'Bearer x' } } } as AuditJob)
    expect(flags.emulatedUserAgent).toBe('UnlighthouseBot/1')
    expect(flags.extraHeaders).toBeUndefined()
  })
})

describe('stored reports', () => {
  test('render without the auth header values of reports stored by earlier versions', () => {
    const legacy = { ...recorded, configSettings: { ...recorded.configSettings, extraHeaders: { authorization: 'Bearer leaked-token' } } }
    const html = renderReport(Bun.gzipSync(JSON.stringify(legacy)))
    expect(html).not.toContain('leaked-token')
    expect(html).toContain('[redacted]')
  })
})

describe('chrome', () => {
  test('reports a missing Chrome with an install hint', () => {
    let error: unknown
    try {
      findChrome('/nonexistent/chrome')
    }
    catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(UnlighthouseError)
    expect((error as UnlighthouseError).code).toBe('CHROME_NOT_FOUND')
    expect((error as UnlighthouseError).message).toContain('CHROME_PATH')
  })

  test('explains sandbox and shared library failures in plain words', () => {
    expect(explainChromeFailure('[0101/000000.000:FATAL:zygote_host_impl_linux.cc(127)] No usable sandbox! Update your kernel')).toContain('UNLIGHTHOUSE_NO_SANDBOX=1')
    expect(explainChromeFailure('Running as root without --no-sandbox is not supported.')).toContain('UNLIGHTHOUSE_NO_SANDBOX=1')
    expect(explainChromeFailure('chrome: error while loading shared libraries: libnss3.so: cannot open shared object file')).toContain('libnss3.so')
  })
})
