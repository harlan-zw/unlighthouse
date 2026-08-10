import { describe, expect, it } from 'vitest'
import { estimateScanDuration } from '../app/features/scan/estimate'

const allCategories = ['performance', 'accessibility', 'seo', 'best-practices', 'agentic-browsing'] as const

describe('scan duration estimate', () => {
  it('accounts for URL count and device profiles', () => {
    const mobile = estimateScanDuration({ urlCount: 10, device: 'mobile', sampleSize: 1, categories: [...allCategories] })
    const both = estimateScanDuration({ urlCount: 10, device: 'both', sampleSize: 1, categories: [...allCategories] })

    expect(both.minSeconds).toBeGreaterThan(mobile.minSeconds)
    expect(both.maxSeconds).toBeGreaterThan(mobile.maxSeconds)
    expect(both.auditRuns).toBe(20)
  })

  it('accounts for samples and category scope', () => {
    const broad = estimateScanDuration({ urlCount: 20, device: 'desktop', sampleSize: 3, categories: [...allCategories] })
    const focused = estimateScanDuration({ urlCount: 20, device: 'desktop', sampleSize: 1, categories: ['seo'] })

    expect(broad.auditRuns).toBe(60)
    expect(broad.minSeconds).toBeGreaterThan(focused.minSeconds)
    expect(broad.factors).toContain('3 samples')
    expect(focused.factors).toContain('1 category')
  })
})
