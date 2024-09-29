import type { UnlighthouseRouteReport } from '../src/types'
import { describe, expect, it } from 'vitest'
import { generateReportPayload } from '../src/reporters'
import _lighthouseReport from './__fixtures__/lighthouseReport.mjs'

const lighthouseReport = _lighthouseReport as any as UnlighthouseRouteReport[]

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
