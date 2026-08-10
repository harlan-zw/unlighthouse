import { describe, expect, it } from 'vitest'
import { ScanPreview, ScanStart } from '../src/commands/scan'

describe('scan.preview contract', () => {
  it('represents ready sitemap, homepage, and one page results', () => {
    expect(ScanPreview.output.parse({
      status: 'ready',
      site: 'https://example.com/',
      mode: 'site',
      urlCount: 42,
      source: 'sitemap',
      confidence: 'high',
      warnings: [],
    }).source).toBe('sitemap')

    expect(ScanPreview.output.parse({
      status: 'ready',
      site: 'https://example.com/',
      mode: 'site',
      urlCount: 8,
      source: 'homepage',
      confidence: 'low',
      warnings: ['cloudflare-trap-links'],
    }).source).toBe('homepage')

    expect(ScanPreview.output.parse({
      status: 'ready',
      site: 'https://example.com/about',
      mode: 'page',
      urlCount: 1,
      source: 'single-page',
      confidence: 'high',
      warnings: [],
    }).urlCount).toBe(1)
  })

  it('models origin protection separately from an unavailable estimate', () => {
    expect(ScanPreview.output.parse({
      status: 'blocked',
      site: 'https://example.com/',
      mode: 'site',
      reason: 'cloudflare-challenge',
      retryAfterSeconds: null,
    }).status).toBe('blocked')
  })

  it('models an advisory unavailable result as data', () => {
    expect(ScanPreview.output.parse({
      status: 'unavailable',
      site: 'https://example.com/',
      mode: 'site',
      reason: 'discovery-unavailable',
    }).status).toBe('unavailable')
  })
})

describe('scan.start page limit contract', () => {
  it('accepts a positive per-run route limit', () => {
    expect(ScanStart.input.parse({
      site: 'https://example.com/',
      maxRoutes: 100,
    }).maxRoutes).toBe(100)
  })

  it('rejects empty and negative route limits', () => {
    expect(ScanStart.input.safeParse({ site: 'https://example.com/', maxRoutes: 0 }).success).toBe(false)
    expect(ScanStart.input.safeParse({ site: 'https://example.com/', maxRoutes: -1 }).success).toBe(false)
  })
})
