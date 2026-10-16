import type { Budgets, ConfigInput } from '../src/config.ts'
import type { BrokenLink } from '../src/contracts.ts'
import type { Category, Device, Issue, Metric, Page, PageStatus, Provenance, Scan } from '../src/types.ts'
import { describe, expect, test } from 'bun:test'
import { checkBudgets } from '../src/analysis/budgets.ts'
import { compareScans } from '../src/analysis/compare.ts'
import { toJUnit } from '../src/analysis/junit.ts'
import { toMarkdown } from '../src/analysis/markdown.ts'
import { describeWarning, summarize } from '../src/analysis/summary.ts'
import { METRIC_THRESHOLDS, rateMetric, scoreBand } from '../src/analysis/thresholds.ts'
import { budgetsSchema } from '../src/config.ts'

const ORIGIN = 'https://example.com'

function scan(id: string, overrides: Partial<Scan> = {}): Scan {
  return {
    id,
    siteId: 1,
    origin: ORIGIN,
    status: 'done',
    label: null,
    branch: 'main',
    commit: `${id}0000000000`,
    devices: ['mobile', 'desktop'],
    options: {},
    stats: { discovered: 0, queued: 0, done: 0, failed: 0, skipped: 0 },
    lighthouseVersion: '13.5.0',
    error: null,
    createdAt: 1_700_000_000_000,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  }
}

const provenance: Provenance = {
  lighthouseVersion: '13.5.0',
  benchmarkIndex: 2000,
  throttling: 'simulate',
  concurrency: 1,
  samples: 1,
  spread: null,
  warnings: [],
}

interface PageInput {
  path: string
  device?: Device
  template?: string
  status?: PageStatus
  scores?: Partial<Record<Category, number | null>>
  metrics?: Partial<Record<Metric, number | null>>
  provenance?: Partial<Provenance>
}

function page(scanId: string, input: PageInput): Page {
  const status = input.status ?? 'done'
  const done = status === 'done'
  return {
    scanId,
    url: `${ORIGIN}${input.path}`,
    path: input.path,
    template: input.template ?? input.path,
    device: input.device ?? 'mobile',
    status,
    scores: {
      'performance': done ? 0.9 : null,
      'accessibility': done ? 0.95 : null,
      'best-practices': done ? 1 : null,
      'seo': done ? 0.92 : null,
      'agentic-browsing': done ? 0.5 : null,
      ...input.scores,
    },
    metrics: {
      fcp: done ? 1200 : null,
      lcp: done ? 2000 : null,
      tbt: done ? 100 : null,
      cls: done ? 0.02 : null,
      si: done ? 2500 : null,
      ttfb: done ? 300 : null,
      ...input.metrics,
    },
    finalUrl: null,
    statusCode: done ? 200 : null,
    provenance: done ? { ...provenance, ...input.provenance } : null,
    error: status === 'failed' ? 'timeout' : null,
    durationMs: null,
    finishedAt: null,
  }
}

function issue(auditId: string, pages: number, overrides: Partial<Issue> = {}): Issue {
  return {
    auditId,
    category: 'performance',
    title: `Title of ${auditId}`,
    severity: 'fail',
    pages,
    items: 0,
    topItems: [],
    devices: ['mobile'],
    templates: ['/'],
    savingsMs: 100,
    savingsBytes: 0,
    impact: pages * 100,
    examples: [`${ORIGIN}/`],
    ...overrides,
  }
}

function budgets(input: NonNullable<ConfigInput['budgets']>): Budgets {
  return budgetsSchema.parse(input)
}

function isWellFormedXml(xml: string): boolean {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, '')
  const stack: string[] = []
  for (const match of body.matchAll(/<(\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g)) {
    const [, closing, name, , selfClosing] = match
    if (selfClosing)
      continue
    if (closing) {
      if (stack.pop() !== name)
        return false
    }
    else {
      stack.push(name!)
    }
  }
  const stripped = body.replace(/<\/?[\w:.-]+(?:\s+[\w:.-]+="[^"<]*")*\s*\/?>/g, '')
  return stack.length === 0 && !/[<>]/.test(stripped) && !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(stripped)
}

describe('thresholds', () => {
  test('LCP 2.5 s / 4 s, CLS 0.1 / 0.25, FCP 1.8 s / 3 s and TTFB 0.8 s / 1.8 s follow web.dev/articles/vitals, lcp, cls, fcp and ttfb', () => {
    expect(rateMetric('lcp', 2500)).toBe('good')
    expect(rateMetric('lcp', 2501)).toBe('needs-improvement')
    expect(rateMetric('lcp', 4001)).toBe('poor')
    expect(rateMetric('cls', 0.1)).toBe('good')
    expect(rateMetric('cls', 0.2)).toBe('needs-improvement')
    expect(rateMetric('cls', 0.3)).toBe('poor')
    expect(rateMetric('fcp', 1800, 'desktop')).toBe('good')
    expect(rateMetric('fcp', 3001)).toBe('poor')
    expect(rateMetric('ttfb', 800)).toBe('good')
    expect(rateMetric('ttfb', 1801)).toBe('poor')
  })

  test('TBT and Speed Index use the Lighthouse scoring curves per device (developer.chrome.com/docs/lighthouse/performance/performance-scoring)', () => {
    expect(METRIC_THRESHOLDS.mobile.tbt).toEqual({ good: 200, poor: 600 })
    expect(METRIC_THRESHOLDS.desktop.tbt).toEqual({ good: 150, poor: 350 })
    expect(rateMetric('tbt', 180, 'desktop')).toBe('needs-improvement')
    expect(rateMetric('si', 3400)).toBe('needs-improvement')
    expect(rateMetric('si', 6000)).toBe('poor')
  })

  test('score bands are 90+ good and 50+ average as in the Lighthouse scoring docs', () => {
    expect(scoreBand(0.9)).toBe('good')
    expect(scoreBand(0.89)).toBe('average')
    expect(scoreBand(0.5)).toBe('average')
    expect(scoreBand(0.49)).toBe('poor')
  })
})

describe('compareScans', () => {
  const base = scan('base')
  const head = scan('head')

  test('keeps run-to-run noise as unchanged and reports real changes', () => {
    const result = compareScans(
      { scan: base, pages: [
        page('base', { path: '/a', scores: { performance: 0.9 }, metrics: { lcp: 2000, tbt: 10 } }),
        page('base', { path: '/b', scores: { performance: 0.9 } }),
        page('base', { path: '/c', metrics: { lcp: 2000 } }),
        page('base', { path: '/d', scores: { accessibility: 0.9 } }),
      ], issues: [] },
      { scan: head, pages: [
        page('head', { path: '/a', scores: { performance: 0.87 }, metrics: { lcp: 2150, tbt: 45 } }),
        page('head', { path: '/b', scores: { performance: 0.84 } }),
        page('head', { path: '/c', metrics: { lcp: 2400 } }),
        page('head', { path: '/d', scores: { accessibility: 0.93 } }),
      ], issues: [] },
    )
    const byPath = Object.fromEntries(result.pages.map(diff => [diff.url.slice(ORIGIN.length), diff]))
    expect(byPath['/a']!.status).toBe('unchanged')
    expect(byPath['/a']!.scores.performance).toEqual({ base: 0.9, head: 0.87, delta: -0.03, change: 'unchanged' })
    expect(byPath['/a']!.metrics.tbt!.change).toBe('unchanged')
    expect(byPath['/b']!.status).toBe('regressed')
    expect(byPath['/b']!.scores.performance!.delta).toBe(-0.06)
    expect(byPath['/c']!.status).toBe('regressed')
    expect(byPath['/c']!.metrics.lcp).toEqual({ base: 2000, head: 2400, delta: 400, change: 'regressed' })
    expect(byPath['/d']!.status).toBe('improved')
    expect(result.totals.pages).toEqual({ unchanged: 1, regressed: 2, improved: 1, added: 0, removed: 0, failed: 0 })
  })

  test('accepts custom noise thresholds', () => {
    const result = compareScans(
      { scan: base, pages: [page('base', { path: '/', scores: { performance: 0.9 } })], issues: [] },
      { scan: head, pages: [page('head', { path: '/', scores: { performance: 0.87 } })], issues: [] },
      { noise: { scores: { performance: 0.01 } } },
    )
    expect(result.pages[0]!.status).toBe('regressed')
    expect(result.noise.scores.accessibility).toBe(0.02)
  })

  test('reports added and removed pages, and a measured page that now fails as failed, not removed', () => {
    const result = compareScans(
      { scan: base, pages: [page('base', { path: '/old' }), page('base', { path: '/same' }), page('base', { path: '/broken' })], issues: [] },
      { scan: head, pages: [page('head', { path: '/new' }), page('head', { path: '/same' }), page('head', { path: '/broken', status: 'failed' })], issues: [] },
    )
    const statuses = Object.fromEntries(result.pages.map(diff => [diff.url.slice(ORIGIN.length), diff.status]))
    expect(statuses).toEqual({ '/old': 'removed', '/same': 'unchanged', '/new': 'added', '/broken': 'failed' })
    expect(result.totals.pages.added).toBe(1)
    expect(result.totals.pages.removed).toBe(1)
    expect(result.totals.pages.failed).toBe(1)
    expect(result.devices[0]!.scores.performance!.pages).toBe(1)
  })

  test('never merges the same URL across devices', () => {
    const result = compareScans(
      { scan: base, pages: [page('base', { path: '/', device: 'mobile', scores: { performance: 0.9 } })], issues: [] },
      { scan: head, pages: [
        page('head', { path: '/', device: 'mobile', scores: { performance: 0.7 } }),
        page('head', { path: '/', device: 'desktop', scores: { performance: 0.99 } }),
      ], issues: [] },
    )
    expect(result.pages.map(diff => [diff.device, diff.status])).toEqual([['desktop', 'added'], ['mobile', 'regressed']])
    expect(result.devices.map(entry => entry.device)).toEqual(['mobile'])
    expect(result.devices[0]!.scores.performance).toEqual({ base: 0.9, head: 0.7, delta: -0.2, pages: 1 })
  })

  test('computes mean deltas per device and per template', () => {
    const result = compareScans(
      { scan: base, pages: [
        page('base', { path: '/blog/a', template: '/blog/*', scores: { performance: 0.9 } }),
        page('base', { path: '/blog/b', template: '/blog/*', scores: { performance: 0.8 } }),
        page('base', { path: '/', template: '/', scores: { performance: 0.9 } }),
      ], issues: [] },
      { scan: head, pages: [
        page('head', { path: '/blog/a', template: '/blog/*', scores: { performance: 0.7 } }),
        page('head', { path: '/blog/b', template: '/blog/*', scores: { performance: 0.6 } }),
        page('head', { path: '/', template: '/', scores: { performance: 0.9 } }),
      ], issues: [] },
    )
    expect(result.templates[0]).toEqual({ template: '/blog/*', device: 'mobile', pages: 2, base: 0.85, head: 0.65, delta: -0.2 })
    expect(result.devices[0]!.scores.performance!.delta).toBe(-0.13)
  })

  test('matches issues by audit and reports new, fixed and persisting with page-count change', () => {
    const result = compareScans(
      { scan: base, pages: [], issues: [issue('unused-javascript', 10, { items: 3 }), issue('image-alt', 3), issue('uses-long-cache-ttl', 4)] },
      { scan: head, pages: [], issues: [issue('unused-javascript', 12, { items: 5 }), issue('render-blocking-insight', 2)] },
    )
    expect(result.issues.new.map(entry => entry.auditId)).toEqual(['render-blocking-insight'])
    expect(result.issues.fixed.map(entry => entry.auditId).sort()).toEqual(['image-alt', 'uses-long-cache-ttl'])
    expect(result.issues.persisting).toHaveLength(1)
    expect(result.issues.persisting[0]).toMatchObject({ auditId: 'unused-javascript', items: 5, basePages: 10, headPages: 12, pagesDelta: 2 })
    expect(result.totals.issues).toEqual({ new: 1, fixed: 2, persisting: 1, unknown: 0 })
  })

  test('does not report issues of pages that failed in head as fixed', () => {
    const affected: Record<string, Array<{ url: string, device: Device }>> = {
      'unused-javascript': [{ url: `${ORIGIN}/a`, device: 'mobile' }, { url: `${ORIGIN}/b`, device: 'mobile' }],
      'uses-long-cache-ttl': [{ url: `${ORIGIN}/b`, device: 'mobile' }],
      'image-alt': [{ url: `${ORIGIN}/b`, device: 'desktop' }],
    }
    const result = compareScans(
      {
        scan: base,
        pages: [page('base', { path: '/a' }), page('base', { path: '/b' }), page('base', { path: '/b', device: 'desktop' })],
        issues: [issue('unused-javascript', 2), issue('uses-long-cache-ttl', 1), issue('image-alt', 1)],
        issuePages: auditId => affected[auditId] ?? [],
      },
      {
        scan: head,
        pages: [page('head', { path: '/a', status: 'failed' }), page('head', { path: '/b' }), page('head', { path: '/b', device: 'desktop' })],
        issues: [],
      },
    )
    expect(result.issues.fixed.map(entry => entry.auditId).sort()).toEqual(['image-alt', 'uses-long-cache-ttl'])
    expect(result.issues.unknown.map(entry => entry.auditId)).toEqual(['unused-javascript'])
    expect(result.totals.issues).toEqual({ new: 0, fixed: 2, persisting: 0, unknown: 1 })
    const summary = summarize({ scan: head, pages: [], issues: [], brokenLinks: [], comparison: result })
    expect(summary.baseline!.issues).toEqual({ new: 0, fixed: 2, unknown: 1 })
    expect(toMarkdown({ summary, comparison: result })).toContain('**Unknown: an affected page failed in this scan (1)**')
  })
})

describe('summarize', () => {
  test('reports per-device scores, p75 metrics, lab CWV pass share, worst templates and coverage', () => {
    const pages = [
      page('s', { path: '/', template: '/', scores: { performance: 0.95 }, metrics: { lcp: 1500, tbt: 50, cls: 0 } }),
      page('s', { path: '/blog/a', template: '/blog/*', scores: { performance: 0.6 }, metrics: { lcp: 3000, tbt: 50, cls: 0 } }),
      page('s', { path: '/blog/b', template: '/blog/*', scores: { performance: 0.4 }, metrics: { lcp: 5000, tbt: 400, cls: 0.3 } }),
      page('s', { path: '/blog/c', template: '/blog/*', status: 'failed' }),
      page('s', { path: '/blog/d', template: '/blog/*', status: 'skipped' }),
      page('s', { path: '/', device: 'desktop', scores: { performance: 1 } }),
    ]
    const summary = summarize({ scan: scan('s', { stats: { discovered: 5, queued: 0, done: 4, failed: 1, skipped: 1 } }), pages, issues: [], brokenLinks: [] })
    const mobile = summary.devices.find(entry => entry.device === 'mobile')!
    expect(mobile.pages).toEqual({ done: 3, failed: 1, skipped: 1 })
    expect(mobile.scores.mean.performance).toBe(0.65)
    expect(mobile.scores.median.performance).toBe(0.6)
    expect(mobile.p75.lcp).toBe(5000)
    expect(mobile.labCwvPass).toEqual({ pages: 3, lcp: 0.33, cls: 0.67, tbtAsInpStandIn: 0.67, all: 0.33 })
    expect(mobile.worstTemplates[0]).toEqual({ template: '/blog/*', pages: 2, meanPerformance: 0.5, worstPath: '/blog/b' })
    expect(summary.devices.find(entry => entry.device === 'desktop')!.scores.mean.performance).toBe(1)
    expect(summary.pages).toEqual({ discovered: 5, audited: 4, skippedBySampling: 1, failed: 1 })
  })

  test('does not count pages left out by a cancelled or failed scan as skipped by sampling', () => {
    const pages = [
      page('s', { path: '/' }),
      page('s', { path: '/a', status: 'skipped' }),
      { ...page('s', { path: '/b', status: 'skipped' }), error: 'Scan cancelled' },
      { ...page('s', { path: '/c', status: 'skipped' }), error: 'Scan failed before this page was audited' },
    ]
    const summary = summarize({ scan: scan('s', { status: 'cancelled' }), pages, issues: [], brokenLinks: [] })
    expect(summary.pages).toEqual({ discovered: 4, audited: 1, skippedBySampling: 1, failed: 0 })
  })

  test('reports origin-wide audits once as site checks and keeps them out of top issues', () => {
    const pages = [page('s', { path: '/' }), page('s', { path: '/a' })]
    const issues = [
      issue('llms-txt', 2, { category: 'agentic-browsing' }),
      issue('robots-txt', 2, { category: 'seo', severity: 'warn' }),
      issue('unused-javascript', 2),
    ]
    const summary = summarize({ scan: scan('s'), pages, issues, brokenLinks: [] })
    expect(summary.siteChecks).toEqual({ 'llms-txt': 'fail', 'ard-schema': 'pass', 'robots-txt': 'warn' })
    expect(summary.topIssues.map(entry => entry.auditId)).toEqual(['unused-javascript'])
  })

  test('marks site checks as not measured when their category did not run', () => {
    const pages = [page('s', { path: '/', scores: { 'agentic-browsing': null } })]
    const summary = summarize({ scan: scan('s'), pages, issues: [], brokenLinks: [] })
    expect(summary.siteChecks['llms-txt']).toBe('not-measured')
  })

  test('warns about conditions that make numbers unreliable', () => {
    const pages = [
      page('s', { path: '/a', status: 'failed' }),
      page('s', { path: '/b', provenance: { spread: 0.2 } }),
      page('s', { path: '/c', provenance: { benchmarkIndex: 600 } }),
      page('s', { path: '/d', provenance: { concurrency: 4 } }),
      page('s', { path: '/e', provenance: { lighthouseVersion: '13.4.1' } }),
      page('s', { path: '/f', provenance: { concurrency: 4, throttling: 'devtools' } }),
    ]
    const summary = summarize({ scan: scan('s'), pages, issues: [], brokenLinks: [] })
    expect(summary.warnings.map(warning => [warning.code, warning.pages])).toEqual([
      ['failed-pages', 1],
      ['high-sample-spread', 1],
      ['low-benchmark-index', 1],
      ['concurrent-simulated-throttling', 1],
      ['mixed-lighthouse-versions', 5],
    ])
  })

  test('flags pages measured by a remote runner as not comparable with local lab runs', () => {
    const pages = [
      page('s', { path: '/a', provenance: { runner: 'psi' } }),
      page('s', { path: '/b', provenance: { runner: 'cdp' } }),
      page('s', { path: '/c', provenance: { runner: 'local' } }),
      page('s', { path: '/d' }),
    ]
    const warnings = summarize({ scan: scan('s'), pages, issues: [], brokenLinks: [] }).warnings
    expect(warnings).toEqual([{ code: 'remote-runner', pages: 2, detail: 'cdp, psi' }])
    expect(describeWarning(warnings[0]!)).toContain('not comparable with local lab runs')
  })

  test('counts broken links and adds the top regressions from a comparison', () => {
    const basePages = [page('b', { path: '/a', scores: { performance: 0.9 } }), page('b', { path: '/b', scores: { performance: 0.9 } })]
    const headPages = [page('h', { path: '/a', scores: { performance: 0.5 }, metrics: { lcp: 4000 } }), page('h', { path: '/b', scores: { performance: 0.8 } })]
    const comparison = compareScans({ scan: scan('b'), pages: basePages, issues: [] }, { scan: scan('h'), pages: headPages, issues: [issue('x', 1)] })
    const brokenLinks: BrokenLink[] = [{ url: `${ORIGIN}/gone`, status: 404, from: `${ORIGIN}/` }, { url: `${ORIGIN}/gone`, status: 404, from: `${ORIGIN}/a` }]
    const summary = summarize({ scan: scan('h'), pages: headPages, issues: [], brokenLinks, comparison })
    expect(summary.brokenLinks).toBe(1)
    expect(summary.baseline!.topRegressions.map(entry => entry.path)).toEqual(['/a', '/b'])
    expect(summary.baseline!.topRegressions[0]).toEqual({ path: '/a', device: 'mobile', scores: { performance: -0.4 }, metrics: { lcp: 2000 } })
    expect(summary.baseline!.scores.mobile!.performance).toBe(-0.25)
    expect(summary.baseline!.issues).toEqual({ new: 1, fixed: 0, unknown: 0 })
  })

  test('stays under 4 KB of JSON for a 500-page scan on two devices', () => {
    const devices: Device[] = ['mobile', 'desktop']
    const makePages = (scanId: string, shift: number) => devices.flatMap(device => Array.from({ length: 500 }, (_, i) => {
      const template = `/category-${i % 25}/*`
      const path = `/category-${i % 25}/blue-cotton-shirt-${i}`
      return page(scanId, {
        path,
        template,
        device,
        status: i % 50 === 0 ? 'failed' : i >= 300 ? 'skipped' : 'done',
        scores: { performance: Math.max(0, ((i * 37) % 100) / 100 - shift) },
        metrics: { lcp: 1000 + ((i * 53) % 5000) + shift * 10000 },
        provenance: { spread: i % 7 === 0 ? 0.2 : 0.01, concurrency: 2 },
      })
    }))
    const issues = Array.from({ length: 300 }, (_, i) => issue(`audit-${i}`, 1 + (i % 40), { items: 12, topItems: [{ key: `${ORIGIN}/_next/static/chunks/pages/vendor-${i}.3f9a2b7c.js`.repeat(3), label: null, pages: 1, savingsMs: 0, savingsBytes: 0 }] }))
    const baseScan = scan('base')
    const headScan = scan('head', { stats: { discovered: 500, queued: 0, done: 290, failed: 10, skipped: 200 } })
    const comparison = compareScans({ scan: baseScan, pages: makePages('base', 0), issues: issues.slice(50) }, { scan: headScan, pages: makePages('head', 0.1), issues })
    const brokenLinks = Array.from({ length: 40 }, (_, i) => ({ url: `${ORIGIN}/missing-${i}`, status: 404, from: ORIGIN }))
    const summary = summarize({ scan: headScan, pages: makePages('head', 0.1), issues, comparison, brokenLinks })
    const size = new TextEncoder().encode(JSON.stringify(summary)).length
    expect(size).toBeLessThan(4096)
    expect(summary.topIssues).toHaveLength(5)
    expect(summary.issueCount).toBe(300)
    expect(summary.baseline!.topRegressions).toHaveLength(5)
  })
})

describe('checkBudgets', () => {
  const pages = [
    page('h', { path: '/', scores: { performance: 0.8 }, metrics: { lcp: 2000 } }),
    page('h', { path: '/slow', scores: { performance: 0.6 }, metrics: { lcp: 5200 } }),
    page('h', { path: '/slower', scores: { performance: 0.6 }, metrics: { lcp: 6100 } }),
  ]
  const summary = summarize({ scan: scan('h', { devices: ['mobile'] }), pages, issues: [], brokenLinks: [] })

  test('checks minimum mean scores and maximum metric values, naming the worst URLs', () => {
    const report = checkBudgets({ summary, pages }, budgets({ scores: { performance: 0.9, seo: 0.9 }, metrics: { lcp: 4000, cls: 0.1 } }))
    expect(report.passed).toBe(false)
    const byRule = Object.fromEntries(report.results.map(result => [result.rule, result]))
    expect(byRule['score:performance']).toEqual({ rule: 'score:performance', scope: 'mobile', actual: 0.67, limit: 0.9, passed: false })
    expect(byRule['score:seo']!.passed).toBe(true)
    expect(byRule['metric:lcp']!.actual).toBe(6100)
    expect(byRule['metric:lcp']!.passed).toBe(false)
    expect(byRule['metric:lcp']!.detail).toBe(`2 page(s) over the limit: ${ORIGIN}/slower (6100 ms), ${ORIGIN}/slow (5200 ms)`)
    expect(byRule['metric:cls']!.passed).toBe(true)
  })

  test('skips regression and new-issue rules without a baseline instead of failing them', () => {
    const report = checkBudgets({ summary, pages }, budgets({ regression: { performance: 0.05 }, newIssues: 0 }))
    expect(report.passed).toBe(true)
    expect(report.results).toEqual([
      { rule: 'regression:performance', scope: 'mobile', actual: null, limit: 0.05, passed: true, skipped: true, detail: 'no baseline' },
      { rule: 'new-issues', scope: 'site', actual: null, limit: 0, passed: true, skipped: true, detail: 'no baseline' },
    ])
  })

  test('fails regression and new-issue rules against a baseline', () => {
    const basePages = pages.map(entry => ({ ...entry, scanId: 'b', scores: { ...entry.scores, performance: 0.9 } }))
    const comparison = compareScans({ scan: scan('b'), pages: basePages, issues: [] }, { scan: scan('h'), pages, issues: [issue('render-blocking-insight', 3)] })
    const report = checkBudgets({ summary, pages, comparison }, budgets({ regression: { performance: 0.1, accessibility: 0.01 }, newIssues: 0 }))
    const byRule = Object.fromEntries(report.results.map(result => [result.rule, result]))
    expect(byRule['regression:performance']).toMatchObject({ actual: 0.23, limit: 0.1, passed: false })
    expect(byRule['regression:accessibility']).toMatchObject({ actual: 0, passed: true })
    expect(byRule['new-issues']).toMatchObject({ actual: 1, passed: false, detail: 'render-blocking-insight (3 page(s))' })
    expect(report.passed).toBe(false)
  })
})

describe('template budgets', () => {
  const pages = [
    page('h', { path: '/', template: '/', scores: { performance: 0.95 }, metrics: { lcp: 1500 } }),
    page('h', { path: '/blog/a', template: '/blog/*', scores: { performance: 0.7 }, metrics: { lcp: 3000 } }),
    page('h', { path: '/blog/b', template: '/blog/*', scores: { performance: 0.5 }, metrics: { lcp: 5200 } }),
    page('h', { path: '/blog/c', template: '/blog/*', status: 'failed' }),
    page('h', { path: '/blog/a', template: '/blog/*', device: 'desktop', scores: { performance: 0.9 }, metrics: { lcp: 1200 } }),
    page('h', { path: '/docs/x/y', template: '/docs/*/*', scores: { performance: 0.99 }, metrics: { lcp: 900 } }),
  ]
  const summary = summarize({ scan: scan('h'), pages, issues: [], brokenLinks: [] })

  test('checks the mean score and the worst page of a template per device, scoped to the template', () => {
    const report = checkBudgets({ summary, pages }, budgets({ templates: [{ match: '/blog/*', scores: { performance: 0.8 }, metrics: { lcp: 4000 } }] }))
    expect(report.passed).toBe(false)
    expect(report.results).toEqual([
      { rule: 'score:performance', scope: 'template:/blog/*/mobile', actual: 0.6, limit: 0.8, passed: false, detail: 'mean over 2 page(s)' },
      { rule: 'metric:lcp', scope: 'template:/blog/*/mobile', actual: 5200, limit: 4000, passed: false, detail: `1 page(s) over the limit: ${ORIGIN}/blog/b (5200 ms)` },
      { rule: 'score:performance', scope: 'template:/blog/*/desktop', actual: 0.9, limit: 0.8, passed: true, detail: 'mean over 1 page(s)' },
      { rule: 'metric:lcp', scope: 'template:/blog/*/desktop', actual: 1200, limit: 4000, passed: true },
    ])
  })

  test('matches path globs, limits to one device and skips budgets without matching pages', () => {
    const report = checkBudgets({ summary, pages }, budgets({
      templates: [
        { match: '/docs/**', device: 'mobile', scores: { performance: 0.9 } },
        { match: '/shop/*', scores: { seo: 0.9 }, metrics: { cls: 0.1 } },
      ],
    }))
    expect(report.passed).toBe(true)
    expect(report.results[0]).toEqual({ rule: 'score:performance', scope: 'template:/docs/**/mobile', actual: 0.99, limit: 0.9, passed: true, detail: 'mean over 1 page(s)' })
    expect(report.results.filter(result => result.scope.startsWith('template:/docs/'))).toHaveLength(1)
    expect(report.results.filter(result => result.scope.startsWith('template:/shop/*'))).toEqual([
      { rule: 'score:seo', scope: 'template:/shop/*/mobile', actual: null, limit: 0.9, passed: true, skipped: true, detail: 'no matching pages' },
      { rule: 'metric:cls', scope: 'template:/shop/*/mobile', actual: null, limit: 0.1, passed: true, skipped: true, detail: 'no matching pages' },
      { rule: 'score:seo', scope: 'template:/shop/*/desktop', actual: null, limit: 0.9, passed: true, skipped: true, detail: 'no matching pages' },
      { rule: 'metric:cls', scope: 'template:/shop/*/desktop', actual: null, limit: 0.1, passed: true, skipped: true, detail: 'no matching pages' },
    ])
  })

  test('shows template results in Markdown and JUnit', () => {
    const report = checkBudgets({ summary, pages }, budgets({ templates: [{ match: '/blog/*', device: 'mobile', scores: { performance: 0.8 } }] }))
    const markdown = toMarkdown({ summary, budgets: report })
    expect(markdown).toContain('| **fail** | `score:performance` | `template:/blog/*/mobile` | 0.6 | 0.8 | mean over 2 page(s) |')
    const xml = toJUnit(report)
    expect(isWellFormedXml(xml)).toBe(true)
    expect(xml).toContain('<testcase classname="unlighthouse.budgets.template:/blog/*/mobile" name="score:performance [template:/blog/*/mobile]"')
    expect(xml).toContain('<failure message="score:performance on template:/blog/*/mobile: actual 0.6, limit 0.8" type="budget">')
  })
})

describe('toMarkdown', () => {
  test('renders the verdict, score table with deltas, failed budgets, regressions and issue changes', () => {
    const basePages = [page('b', { path: '/a', scores: { performance: 0.9 } }), page('b', { path: '/b', scores: { performance: 0.9 } })]
    const headPages = [page('h', { path: '/a', scores: { performance: 0.5 }, metrics: { lcp: 4500 } }), page('h', { path: '/b', scores: { performance: 0.9 } })]
    const newIssues = Array.from({ length: 7 }, (_, i) => issue(`audit-${i}`, 7 - i, { title: `Title|${i}`, items: 3 }))
    const comparison = compareScans({ scan: scan('base'), pages: basePages, issues: [issue('gone', 2)] }, { scan: scan('head'), pages: headPages, issues: newIssues })
    const summary = summarize({ scan: scan('head'), pages: headPages, issues: newIssues, comparison, brokenLinks: [] })
    const report = checkBudgets({ summary, pages: headPages, comparison }, budgets({ scores: { performance: 0.9, seo: 0.5 } }))
    const markdown = toMarkdown({ summary, comparison, budgets: report, reportUrl: 'https://ci.example/report' })
    const lines = markdown.split('\n')
    expect(lines[0]).toBe('### Unlighthouse · https://example.com')
    expect(lines).toContain('**Budgets failed**: 1 of 2 rules · 1 page(s) regressed, 0 improved vs `base000` · [Full report](https://ci.example/report)')
    expect(lines).toContain('| Device | Performance | Accessibility | Best practices | SEO | Agentic browsing |')
    expect(lines).toContain('| mobile | 70 (-20) | 95 | 100 | 92 | 50 |')
    expect(lines).toContain('| **fail** | `score:performance` | mobile | 0.7 | 0.9 |  |')
    expect(lines).toContain('| /a | mobile | /a | Performance -40, LCP +2500 ms |')
    expect(lines).toContain('**New (7)**')
    expect(lines).toContain('- Title\\|0 (`audit-0`) · 3 resources · 7 page(s)')
    expect(lines).toContain('<summary>2 more</summary>')
    expect(lines).toContain('**Fixed (1)**')
    expect(lines).toContain('Audited 2 of 2 discovered pages (0 skipped by sampling)')
    expect(lines).toContain('Site checks: llms.txt pass · ai-catalog.json (ARD) pass · robots.txt pass')
    expect(lines).not.toContain('| desktop | – | – | – | – | – |')
  })

  test('works without baseline or budgets and shows warnings', () => {
    const pages = [page('s', { path: '/', provenance: { benchmarkIndex: 500 } })]
    const summary = summarize({ scan: scan('s', { devices: ['mobile'] }), pages, issues: [issue('unused-css-rules', 1)], brokenLinks: [] })
    const markdown = toMarkdown({ summary })
    expect(markdown).toContain('**Scan done**')
    expect(markdown).toContain('> [!WARNING]')
    expect(markdown).toContain('<summary>Top issues (1)</summary>')
    expect(markdown).not.toContain('#### Budgets')
  })
})

describe('toJUnit', () => {
  test('emits one testcase per rule with failures and skips counted, as well-formed XML', () => {
    const pages = [page('h', { path: '/a&b', scores: { performance: 0.5 }, metrics: { lcp: 9000 } })]
    const summary = summarize({ scan: scan('h', { devices: ['mobile'] }), pages, issues: [], brokenLinks: [] })
    const report = checkBudgets({ summary, pages }, budgets({ scores: { performance: 0.9, seo: 0.5 }, metrics: { lcp: 4000 }, regression: { performance: 0.05 } }))
    const xml = toJUnit(report)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(isWellFormedXml(xml)).toBe(true)
    expect(xml).toContain('<testsuites name="unlighthouse" tests="4" failures="2" errors="0" skipped="1">')
    expect(xml.match(/<testcase /g)).toHaveLength(4)
    expect(xml).toContain('<skipped message="no baseline"/>')
    expect(xml).toContain('https://example.com/a&amp;b (9000 ms)')
    expect(xml.match(/<failure /g)).toHaveLength(2)
  })
})
