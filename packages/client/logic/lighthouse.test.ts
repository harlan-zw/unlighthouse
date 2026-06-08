import { describe, expect, it } from 'vitest'
import { lcpElementItems } from './lighthouse'

describe('lcpElementItems (#375)', () => {
  it('returns [] when the audit is notApplicable with no details', () => {
    // shape Lighthouse 12 returns when no LCP element is detected
    const audit = { id: 'largest-contentful-paint-element', score: null, notApplicable: true }
    expect(lcpElementItems(audit)).toEqual([])
  })

  it('returns [] for a missing audit', () => {
    expect(lcpElementItems(undefined)).toEqual([])
  })

  it('returns the element rows from the nested list detail (happy path)', () => {
    const rows = [{ node: { type: 'node', snippet: '<img>' } }]
    const audit = {
      id: 'largest-contentful-paint-element',
      details: { type: 'list', items: [{ type: 'table', items: rows }] },
    }
    expect(lcpElementItems(audit)).toBe(rows)
  })

  it('returns [] for the legacy flat table detail rather than throwing', () => {
    const audit = {
      id: 'largest-contentful-paint-element',
      details: { type: 'table', items: [{ node: { type: 'node' } }] },
    }
    expect(lcpElementItems(audit)).toEqual([])
  })
})
