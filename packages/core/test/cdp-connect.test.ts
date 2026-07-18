import { describe, expect, it, vi } from 'vitest'
import { createCdpConnectAuditor } from '../src/auditors/cdp-connect'

function lhr() {
  return {
    requestedUrl: 'https://example.com',
    finalUrl: 'https://example.com',
    fetchTime: '2026-07-01T00:00:00.000Z',
    lighthouseVersion: '13.0.0',
    categories: {
      'agentic-browsing': {
        id: 'agentic-browsing',
        title: 'Agentic Browsing',
        score: 0.5,
        categoryScoreDisplayMode: 'fraction',
        auditRefs: [],
      },
    },
    audits: {
      'cumulative-layout-shift': {
        id: 'cumulative-layout-shift',
        title: 'Cumulative Layout Shift',
        score: 1,
        numericValue: 0,
      },
    },
  }
}

describe('createCdpConnectAuditor', () => {
  it('lets callers narrow advertised categories for remote browser gaps', () => {
    const auditor = createCdpConnectAuditor({
      browserWSEndpoint: 'ws://chrome',
      capabilities: {
        categories: ['accessibility', 'seo', 'best-practices'],
      },
    })

    expect(auditor.capabilities.categories).toEqual(['accessibility', 'seo', 'best-practices'])
    expect(auditor.capabilities.categories).not.toContain('agentic-browsing')
  })

  it('attaches extracted metrics and a gzipped LHR for persistence', async () => {
    const page = {
      goto: vi.fn(async () => undefined),
    }
    const browser = {
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => undefined),
      disconnect: vi.fn(),
    }
    const connect = vi.fn(async () => browser)
    const runLighthouse = vi.fn(async () => ({ lhr: lhr() }))
    const auditor = createCdpConnectAuditor({
      browserWSEndpoint: 'ws://chrome',
      connect: connect as never,
      runLighthouse,
    })

    const report = await auditor.audit('https://example.com', undefined, {
      device: 'desktop',
      lighthouseFlags: { onlyCategories: ['agentic-browsing'] },
    })

    expect(report.extracted?.scoreAgenticBrowsing).toBe(0.5)
    expect(report.lhrGzip).toBeInstanceOf(Uint8Array)
    expect(runLighthouse).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        onlyCategories: ['agentic-browsing'],
        formFactor: 'desktop',
      }),
      undefined,
      page,
    )
    expect(browser.close).toHaveBeenCalled()
  })
})
