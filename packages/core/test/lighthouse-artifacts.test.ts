import type { Result } from 'lighthouse'
import { describe, expect, it } from 'vitest'
import { generateReportArtifacts } from '../src/puppeteer/tasks/lighthouse'

// minimal lighthouse result; ReportGenerator only inlines the JSON, it does not validate the shape
const lhr = {
  lighthouseVersion: '12.6.1',
  requestedUrl: 'https://example.com',
  finalDisplayedUrl: 'https://example.com',
  fetchTime: '2026-06-08T00:00:00.000Z',
  categories: { performance: { id: 'performance', title: 'Performance', score: 0.92 } },
  audits: {
    'largest-contentful-paint': {
      id: 'largest-contentful-paint',
      title: 'Largest Contentful Paint',
      score: 0.81,
      numericValue: 2531,
      displayValue: '2.5 s',
    },
  },
  configSettings: { formFactor: 'mobile' },
} as unknown as Result

describe('generateReportArtifacts (#376)', () => {
  it('renders the html report and json from the same single result', () => {
    const { html, json } = generateReportArtifacts(lhr)

    // json is the source of truth, html embeds that same source
    const parsed = JSON.parse(json)
    expect(parsed.audits['largest-contentful-paint'].displayValue).toBe('2.5 s')
    expect(parsed.audits['largest-contentful-paint'].numericValue).toBe(2531)

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('2.5 s')
    expect(html).toContain('2531')
  })

  it('reflects the exact result passed in, not a previous run', () => {
    const median = { ...lhr, audits: { ...lhr.audits, 'largest-contentful-paint': { ...lhr.audits['largest-contentful-paint'], numericValue: 4000, displayValue: '4.0 s' } } } as unknown as Result
    const { html, json } = generateReportArtifacts(median)

    expect(JSON.parse(json).audits['largest-contentful-paint'].numericValue).toBe(4000)
    expect(html).toContain('4.0 s')
    expect(html).not.toContain('2.5 s')
  })
})
