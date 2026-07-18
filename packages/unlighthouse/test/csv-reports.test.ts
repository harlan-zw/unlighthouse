import type { UnlighthouseRouteReport } from '../src/cli/types'
import { describe, expect, it } from 'vitest'
import _lighthouseReport from '../../../test/fixtures/lighthouseReport.mjs'
import { DefaultColumns } from '../src/constants'
import { generateReportPayload } from '../src/reporters'

// Historical JS fixture boundary; the matrix fixtures below stay fully typed.
const lighthouseReport: UnlighthouseRouteReport[] = _lighthouseReport

// D-029 matrix fixture: minimal fan-out — same path scanned under mobile +
// desktop, both with the same category set, but distinct scores so we can
// see each row is preserved (not collapsed). Deliberately tiny so the
// snapshot stays readable.
function makeMatrixReport(path: string, device: 'mobile' | 'desktop', perf: number, a11y: number): UnlighthouseRouteReport {
  return {
    tasks: { inspectHtmlTask: 'completed', runLighthouseTask: 'completed' },
    artifactPath: '',
    artifactUrl: '',
    reportId: `${path}-${device}`,
    route: { id: path, url: `https://example.com${path}`, $url: new URL(`https://example.com${path}`), path, definition: { name: '_index', path } },
    device,
    report: {
      score: (perf + a11y) / 2,
      categories: [
        { key: 'performance', id: 'performance', title: 'Performance', score: perf },
        { key: 'accessibility', id: 'accessibility', title: 'Accessibility', score: a11y },
      ],
      audits: {},
      computed: {
        imageIssues: { score: 0, displayValue: '' },
        ariaIssues: { score: 0, displayValue: '' },
      },
    },
  }
}

const matrixReports: UnlighthouseRouteReport[] = [
  makeMatrixReport('/', 'mobile', 0.85, 0.92),
  makeMatrixReport('/', 'desktop', 0.97, 0.92),
  makeMatrixReport('/about', 'mobile', 0.78, 0.88),
  makeMatrixReport('/about', 'desktop', 0.95, 0.88),
]

describe('csv reports', () => {
  it('basic', () => {
    const actual = generateReportPayload('csv', lighthouseReport)
    expect(actual).toMatchInlineSnapshot(`
      "URL,Score,Performance,Accessibility,Best Practices,SEO,Device
      "/",98,100,100,100,92,""
      "/blog",97,100,97,100,92,""
      "/blog/2023-february",97,100,97,100,92,""
      "/blog/2023-march",97,100,97,100,92,""
      "/blog/how-the-heck-does-vite-work",97,100,97,100,92,""
      "/blog/modern-package-development",95,100,97,92,92,""
      "/blog/vue-automatic-component-imports",97,100,97,100,92,""
      "/projects",97,100,97,100,92,""
      "/sponsors",97,100,97,100,92,""
      "/talks",97,100,97,100,92,"""
    `)
  })

  it('expanded', () => {
    const actual = generateReportPayload('csvExpanded', lighthouseReport, { columns: DefaultColumns })
    expect(actual).toMatchInlineSnapshot(`
      "URL,Score,Performance,Accessibility,Best Practices,SEO,FCP,LCP,CLS,FID,TBT,Color Contrast,Headings,Image Alts,Link Names,Errors,Inspector Issues,Images Responsive,Image Aspect Ratio,Indexable,Device
      "/",98,100,100,100,92,140.98,279.17,0,68.82,0,1,1,1,1,1,1,1,1,1,""
      "/blog",97,100,97,100,92,149.49,271.21,0,51.46,0,0,1,1,1,1,1,1,1,1,""
      "/blog/2023-february",97,100,97,100,92,210.35,350.38,0,61.1,0,0,1,1,1,1,1,1,1,1,""
      "/blog/2023-march",97,100,97,100,92,392.09,486.98,0,44.92,0,0,1,1,1,1,1,1,1,1,""
      "/blog/how-the-heck-does-vite-work",97,100,97,100,92,205.31,332.11,0,52.51,2.51,0,1,1,1,1,1,1,1,1,""
      "/blog/modern-package-development",95,100,97,92,92,422.26,568.43,0,55.73,5.73,0,1,1,1,1,1,1,1,1,""
      "/blog/vue-automatic-component-imports",97,100,97,100,92,225.64,507.04,0,91.53,81.86,0,1,1,1,1,1,1,1,1,""
      "/projects",97,100,97,100,92,236.85,391.93,0,75.74,25.74,0,1,1,1,1,1,1,1,1,""
      "/sponsors",97,100,97,100,92,226.68,405.03,0,58.72,0,0,1,1,1,1,1,1,1,1,""
      "/talks",97,100,97,100,92,224.75,244.35,0,33.67,0,0,1,1,1,1,1,1,1,1,"""
    `)
  })

  // D-029 Phase 8 — matrix scans fan-out into one row per (url, device) and
  // the device column populates rather than being empty. Order is `desktop`
  // before `mobile` for the same path (alphabetical secondary sort in
  // `generateReportPayload`).
  it('preserves multi-device matrix as distinct rows with populated device column', () => {
    const actual = generateReportPayload('csv', matrixReports)
    expect(actual).toMatchInlineSnapshot(`
      "URL,Score,Performance,Accessibility,Device
      "/",95,97,92,"desktop"
      "/",89,85,92,"mobile"
      "/about",92,95,88,"desktop"
      "/about",83,78,88,"mobile""
    `)
  })

  it('matrix scans keep both devices in csvExpanded without extra columns', () => {
    const actual = generateReportPayload('csvExpanded', matrixReports)
    // No `columns` config — exercises the early-return branch in
    // `reportCSVExpanded` to confirm device still lands last.
    expect(actual).toMatchInlineSnapshot(`
      "URL,Score,Performance,Accessibility,Device
      "/",95,97,92,"desktop"
      "/",89,85,92,"mobile"
      "/about",92,95,88,"desktop"
      "/about",83,78,88,"mobile""
    `)
  })
})
