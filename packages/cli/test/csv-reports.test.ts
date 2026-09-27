import type { UnlighthouseRouteReport } from '../src/types'
import { describe, expect, it } from 'vitest'
import { DefaultColumns } from '../../core/src/constants'
import { generateReportPayload } from '../src/reporters'
import _lighthouseReport from './__fixtures__/lighthouseReport.mjs'

const lighthouseReport = _lighthouseReport as any as UnlighthouseRouteReport[]

function routeReport(path: string, categories: { key: string, title: string, score: number | null }[], audits: Record<string, unknown> = {}): UnlighthouseRouteReport {
  return {
    route: { path },
    report: {
      score: 0.5,
      categories,
      audits,
    },
  } as UnlighthouseRouteReport
}

const performance = { key: 'performance', title: 'Performance', score: 1 }
const accessibility = { key: 'accessibility', title: 'Accessibility', score: 0.8 }

const columns = {
  performance: [
    { label: 'FCP', key: 'report.audits.first-contentful-paint', cols: 1 },
    { label: 'LCP', key: 'report.audits.largest-contentful-paint', cols: 2 },
  ],
  accessibility: [
    { label: 'Color Contrast', key: 'report.audits.color-contrast', cols: 1 },
  ],
} as const

describe('csv reports', () => {
  it('basic', () => {
    const actual = generateReportPayload('csv', lighthouseReport)
    expect(actual).toMatchInlineSnapshot(`
      "URL,Score,Performance,Accessibility,Best Practices,SEO
      "/",98,100,100,100,92
      "/blog",97,100,97,100,92
      "/blog/2023-february",97,100,97,100,92
      "/blog/2023-march",97,100,97,100,92
      "/blog/how-the-heck-does-vite-work",97,100,97,100,92
      "/blog/modern-package-development",95,100,97,92,92
      "/blog/vue-automatic-component-imports",97,100,97,100,92
      "/projects",97,100,97,100,92
      "/sponsors",97,100,97,100,92
      "/talks",97,100,97,100,92"
    `)
  })

  it('keeps a missing expanded metric in its own column', () => {
    const reports = [
      routeReport('/a', [performance], {
        'first-contentful-paint': { scoreDisplayMode: 'numeric', numericValue: 140.986, score: 0.9 },
        'largest-contentful-paint': { scoreDisplayMode: 'numeric', numericValue: 200, score: 0.8 },
      }),
      routeReport('/b', [performance], {
        'largest-contentful-paint': { scoreDisplayMode: 'numeric', numericValue: 300, score: 0.7 },
      }),
    ]

    const actual = generateReportPayload('csvExpanded', reports, { columns: columns as any })
    const [header, first, second] = actual.split('\n')

    expect(header).toBe('URL,Score,Performance,FCP,LCP')
    expect(first).toBe('"/a",50,100,140.99,200')
    expect(second).toBe('"/b",50,100,,300')
    expect(second!.split(',').length).toBe(header!.split(',').length)
  })

  it('includes a metric that only a later route reports', () => {
    const reports = [
      routeReport('/a', [performance, accessibility], {
        'first-contentful-paint': { scoreDisplayMode: 'numeric', numericValue: 10, score: 1 },
      }),
      routeReport('/b', [performance, accessibility], {
        'first-contentful-paint': { scoreDisplayMode: 'numeric', numericValue: 20, score: 1 },
        'color-contrast': { scoreDisplayMode: 'binary', score: 0 },
      }),
    ]

    const actual = generateReportPayload('csvExpanded', reports, { columns: columns as any })
    const [header, first, second] = actual.split('\n')

    expect(header).toBe('URL,Score,Performance,Accessibility,FCP,Color Contrast')
    expect(first).toBe('"/a",50,100,80,10,')
    expect(second).toBe('"/b",50,100,80,20,0')
  })

  it('leaves an empty category cell when a later route has no such category', () => {
    const reports = [
      routeReport('/a', [performance, accessibility]),
      routeReport('/b', [performance]),
    ]

    expect(generateReportPayload('csv', reports)).toBe([
      'URL,Score,Performance,Accessibility',
      '"/a",50,100,80',
      '"/b",50,100,""',
    ].join('\n'))
  })

  it('adds a category that only appears on a later route', () => {
    const reports = [
      routeReport('/a', [performance]),
      routeReport('/b', [performance, accessibility]),
    ]

    expect(generateReportPayload('csv', reports)).toBe([
      'URL,Score,Performance,Accessibility',
      '"/a",50,100,""',
      '"/b",50,100,80',
    ].join('\n'))
  })

  it('skips a metric that is notApplicable on every route', () => {
    const reports = [
      routeReport('/a', [performance], {
        'first-contentful-paint': { scoreDisplayMode: 'notApplicable', numericValue: 10, score: null },
        'largest-contentful-paint': { scoreDisplayMode: 'numeric', numericValue: 20, score: 1 },
      }),
    ]

    const [header] = generateReportPayload('csvExpanded', reports, { columns: columns as any }).split('\n')

    expect(header).toBe('URL,Score,Performance,LCP')
  })

  it('keeps a column when one route marks it notApplicable and another has a value', () => {
    const reports = [
      routeReport('/a', [performance], {
        'first-contentful-paint': { scoreDisplayMode: 'notApplicable', score: null },
      }),
      routeReport('/b', [performance], {
        'first-contentful-paint': { scoreDisplayMode: 'numeric', numericValue: 12.5, score: 1 },
      }),
    ]

    expect(generateReportPayload('csvExpanded', reports, { columns: columns as any })).toBe([
      'URL,Score,Performance,FCP',
      '"/a",50,100,',
      '"/b",50,100,12.5',
    ].join('\n'))
  })

  it('expanded', () => {
    const actual = generateReportPayload('csvExpanded', lighthouseReport, { columns: DefaultColumns })
    expect(actual).toMatchInlineSnapshot(`
      "URL,Score,Performance,Accessibility,Best Practices,SEO,FCP,LCP,CLS,FID,TBT,Color Contrast,Headings,Image Alts,Link Names,Errors,Inspector Issues,Images Responsive,Image Aspect Ratio,Indexable
      "/",98,100,100,100,92,140.98,279.17,0,68.82,0,1,1,1,1,1,1,1,1,1
      "/blog",97,100,97,100,92,149.49,271.21,0,51.46,0,0,1,1,1,1,1,1,1,1
      "/blog/2023-february",97,100,97,100,92,210.35,350.38,0,61.1,0,0,1,1,1,1,1,1,1,1
      "/blog/2023-march",97,100,97,100,92,392.09,486.98,0,44.92,0,0,1,1,1,1,1,1,1,1
      "/blog/how-the-heck-does-vite-work",97,100,97,100,92,205.31,332.11,0,52.51,2.51,0,1,1,1,1,1,1,1,1
      "/blog/modern-package-development",95,100,97,92,92,422.26,568.43,0,55.73,5.73,0,1,1,1,1,1,1,1,1
      "/blog/vue-automatic-component-imports",97,100,97,100,92,225.64,507.04,0,91.53,81.86,0,1,1,1,1,1,1,1,1
      "/projects",97,100,97,100,92,236.85,391.93,0,75.74,25.74,0,1,1,1,1,1,1,1,1
      "/sponsors",97,100,97,100,92,226.68,405.03,0,58.72,0,0,1,1,1,1,1,1,1,1
      "/talks",97,100,97,100,92,224.75,244.35,0,33.67,0,0,1,1,1,1,1,1,1,1"
    `)
  })
})
