import type { UnlighthouseRouteReport } from '../packages/unlighthouse/src/cli/types'
import { describe, expect, it } from 'vitest'
import { generateReportPayload } from '../packages/unlighthouse/src/cli/reporters'
import _lighthouseReport from './fixtures/lighthouseReport.mjs'

const lighthouseReport = _lighthouseReport as any as UnlighthouseRouteReport[]

// D-029: synthetic matrix fixture — same path on two devices — so the
// JSON exports can be asserted as one entry per (path, device) without
// pulling a 36k-line fixture.
function makeMatrixReport(path: string, device: 'mobile' | 'desktop', perf: number, seo: number): UnlighthouseRouteReport {
  return {
    tasks: {} as any,
    artifactPath: '',
    artifactUrl: '',
    reportId: `${path}-${device}`,
    route: { id: path, url: `https://example.com${path}`, $url: new URL(`https://example.com${path}`), path, definition: { name: '_index', path } } as any,
    device,
    report: {
      score: (perf + seo) / 2,
      categories: [
        { key: 'performance', id: 'performance', title: 'Performance', score: perf },
        { key: 'seo', id: 'seo', title: 'SEO', score: seo },
      ],
      audits: {
        'largest-contentful-paint': { id: 'largest-contentful-paint', title: 'LCP', description: 'd', numericUnit: 'ms', numericValue: 1234, displayValue: '1.2 s' } as any,
      },
    } as any,
  }
}

const matrixReports: UnlighthouseRouteReport[] = [
  makeMatrixReport('/', 'mobile', 0.8, 0.9),
  makeMatrixReport('/', 'desktop', 0.95, 0.9),
]

describe('reporter', () => {
  it('simple json', () => {
    const actual = generateReportPayload('jsonSimple', lighthouseReport)
    expect(actual[0].path).toBeDefined()
    expect(actual[0].score).toBeDefined()

    expect(actual).toMatchInlineSnapshot(`
      [
        {
          "accessibility": 1,
          "best-practices": 1,
          "path": "/",
          "performance": 1,
          "score": 0.98,
          "seo": 0.92,
        },
        {
          "accessibility": 0.97,
          "best-practices": 1,
          "path": "/blog",
          "performance": 1,
          "score": 0.97,
          "seo": 0.92,
        },
        {
          "accessibility": 0.97,
          "best-practices": 1,
          "path": "/blog/2023-february",
          "performance": 1,
          "score": 0.97,
          "seo": 0.92,
        },
        {
          "accessibility": 0.97,
          "best-practices": 1,
          "path": "/blog/2023-march",
          "performance": 1,
          "score": 0.97,
          "seo": 0.92,
        },
        {
          "accessibility": 0.97,
          "best-practices": 1,
          "path": "/blog/how-the-heck-does-vite-work",
          "performance": 1,
          "score": 0.97,
          "seo": 0.92,
        },
        {
          "accessibility": 0.97,
          "best-practices": 0.92,
          "path": "/blog/modern-package-development",
          "performance": 1,
          "score": 0.95,
          "seo": 0.92,
        },
        {
          "accessibility": 0.97,
          "best-practices": 1,
          "path": "/blog/vue-automatic-component-imports",
          "performance": 1,
          "score": 0.97,
          "seo": 0.92,
        },
        {
          "accessibility": 0.97,
          "best-practices": 1,
          "path": "/projects",
          "performance": 1,
          "score": 0.97,
          "seo": 0.92,
        },
        {
          "accessibility": 0.97,
          "best-practices": 1,
          "path": "/sponsors",
          "performance": 1,
          "score": 0.97,
          "seo": 0.92,
        },
        {
          "accessibility": 0.97,
          "best-practices": 1,
          "path": "/talks",
          "performance": 1,
          "score": 0.97,
          "seo": 0.92,
        },
      ]
    `)
  })

  it('has basic information for json expanded report', () => {
    const actual = generateReportPayload('jsonExpanded', lighthouseReport)
    expect(actual.summary).toBeDefined()
    expect(actual.summary.score).toBeDefined()
    expect(actual.routes[0].path).toBeDefined()
    expect(actual.routes[0].score).toBeDefined()
  })

  it('has metadata information generated as part of the report', () => {
    const actual = generateReportPayload('jsonExpanded', lighthouseReport)
    expect(actual.metadata).toBeDefined()
    expect(actual.metadata.metrics).toBeDefined()
    expect(actual.metadata.metrics['largest-contentful-paint']).toBeDefined()
    expect(actual.metadata.metrics['cumulative-layout-shift']).toBeDefined()
    expect(actual.metadata.metrics['first-contentful-paint']).toBeDefined()
    expect(actual.metadata.metrics['total-blocking-time']).toBeDefined()
    expect(actual.metadata.metrics['max-potential-fid']).toBeDefined()
    expect(actual.metadata.metrics.interactive).toBeDefined()

    expect(actual.metadata.categories).toBeDefined()
    expect(actual.metadata.categories.performance).toBeDefined()
    expect(actual.metadata.categories.accessibility).toBeDefined()
    expect(actual.metadata.categories.seo).toBeDefined()
    expect(actual.metadata.categories['best-practices']).toBeDefined()
  })

  it('has category information for json expanded report', () => {
    const actual = generateReportPayload('jsonExpanded', lighthouseReport)

    expect(actual.summary.categories).toBeDefined()
    expect(actual.summary.categories.performance).toBeDefined()
    expect(actual.summary.categories.accessibility).toBeDefined()
    expect(actual.summary.categories.seo).toBeDefined()
    expect(actual.summary.categories['best-practices']).toBeDefined()
    expect(actual.routes[0].categories).toBeDefined()
    expect(actual.routes[0].categories.performance).toBeDefined()
    expect(actual.routes[0].categories.accessibility).toBeDefined()
    expect(actual.routes[0].categories.seo).toBeDefined()
    expect(actual.routes[0].categories['best-practices']).toBeDefined()
  })

  // D-029 Phase 8 — multi-device matrix scans surface one route entry per
  // (path, device) with the device field populated. Single-device reports
  // omit the field (back-compat with legacy fixtures asserted in the
  // snapshots above).
  it('jsonSimple emits one entry per (path, device) for matrix scans', () => {
    const actual = generateReportPayload('jsonSimple', matrixReports)
    expect(actual).toHaveLength(2)
    const desktop = actual.find(r => r.device === 'desktop')
    const mobile = actual.find(r => r.device === 'mobile')
    expect(desktop).toBeDefined()
    expect(mobile).toBeDefined()
    expect(desktop!.path).toBe('/')
    expect(mobile!.path).toBe('/')
    expect(desktop!.performance).toBeCloseTo(0.95)
    expect(mobile!.performance).toBeCloseTo(0.8)
  })

  it('jsonExpanded surfaces device on each route entry for matrix scans', () => {
    const actual = generateReportPayload('jsonExpanded', matrixReports)
    expect(actual.routes).toHaveLength(2)
    // Secondary sort by device → alphabetical → desktop before mobile.
    expect(actual.routes[0].device).toBe('desktop')
    expect(actual.routes[1].device).toBe('mobile')
    expect(actual.routes[0].path).toBe('/')
    expect(actual.routes[1].path).toBe('/')
  })

  it('jsonSimple omits the device field for legacy single-device reports', () => {
    const actual = generateReportPayload('jsonSimple', lighthouseReport)
    // Snapshot above already asserts shape; this guard catches regressions
    // where a stray device default would creep into single-device output.
    for (const r of actual)
      expect(r.device).toBeUndefined()
  })

  it('has metrics information for json expanded report', () => {
    const actual = generateReportPayload('jsonExpanded', lighthouseReport)

    expect(actual.summary.metrics).toBeDefined()
    expect(actual.summary.metrics['largest-contentful-paint']).toBeDefined()
    expect(actual.summary.metrics['cumulative-layout-shift']).toBeDefined()
    expect(actual.summary.metrics['first-contentful-paint']).toBeDefined()
    expect(actual.summary.metrics['total-blocking-time']).toBeDefined()
    expect(actual.summary.metrics['max-potential-fid']).toBeDefined()
    expect(actual.summary.metrics.interactive).toBeDefined()
    expect(actual.routes[0].metrics).toBeDefined()
    expect(actual.routes[0].metrics['largest-contentful-paint']).toBeDefined()
    expect(actual.routes[0].metrics['cumulative-layout-shift']).toBeDefined()
    expect(actual.routes[0].metrics['first-contentful-paint']).toBeDefined()
    expect(actual.routes[0].metrics['total-blocking-time']).toBeDefined()
    expect(actual.routes[0].metrics['max-potential-fid']).toBeDefined()
    expect(actual.routes[0].metrics.interactive).toBeDefined()
  })
})
