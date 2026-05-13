import type { Logger } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, LighthouseReport, Page } from '@unlighthouse/contracts/ports'
import lighthouse from 'lighthouse'
import puppeteer from 'puppeteer-core'

export interface CdpConnectOptions {
  /** WebSocket endpoint of the remote Chrome (browserless, CF Browser Rendering, self-hosted, etc.) */
  browserWSEndpoint: string
  /** Optional auth headers (e.g. CF API token). */
  headers?: Record<string, string>
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

// D-022: remote CDP can't produce reliable perf scores (network RTT contaminates LCP/TBT/SI).
// `categories` excludes 'performance' because callers should route perf elsewhere.
const CDP_CONNECT_CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: false,
  reliableFieldData: false,
  supportsThrottling: false,
  categories: ['accessibility', 'seo', 'best-practices'],
}

// Race a puppeteer promise against an AbortSignal; puppeteer goto doesn't natively accept one.
function withAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal)
    return p
  if (signal.aborted)
    return Promise.reject(new Error('Aborted'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

export function createCdpConnectAuditor(opts: CdpConnectOptions): Auditor {
  return {
    capabilities: CDP_CONNECT_CAPABILITIES,
    async audit(url: string, _page?: Page, auditOpts: AuditOpts = {}): Promise<LighthouseReport> {
      const { signal } = auditOpts
      const browser = await puppeteer.connect({
        browserWSEndpoint: opts.browserWSEndpoint,
        headers: opts.headers,
      })
      try {
        const page = await browser.newPage()
        await withAbort(page.goto(url, { waitUntil: 'networkidle0' }), signal)

        // Lighthouse v11+ accepts a connected puppeteer Page as the 4th arg; port is omitted.
        const result = await lighthouse(url, { output: 'json' }, undefined, page as any)
        if (!result || !result.lhr)
          throw new Error('Lighthouse failed to run against connected CDP page')
        return result.lhr as unknown as LighthouseReport
      }
      finally {
        await browser.disconnect()
      }
    },
  }
}
