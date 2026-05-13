import type { Logger, UnlighthouseOptions, UnlighthouseProvider, UnlighthouseReport } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, LighthouseReport, Page } from '@unlighthouse/contracts/ports'
import { launch } from 'chrome-launcher'
import lighthouse, { generateReport as _generateReport } from 'lighthouse'
import { extractInsights } from './extract'
import { resolveLighthouseConfig } from './lighthouse-config'

export const generateReport = _generateReport

export interface LocalAuditorOptions {
  /** Default UnlighthouseOptions applied to every audit call. */
  defaults?: UnlighthouseOptions
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

const LOCAL_CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: true,
  reliableFieldData: false,
  supportsThrottling: true,
  categories: ['performance', 'accessibility', 'seo', 'best-practices'],
}

export function createLocalProvider(): UnlighthouseProvider {
  return async (url: string, options: UnlighthouseOptions = {}): Promise<UnlighthouseReport> => {
    let chrome
    let port = options.port || options.lighthouseFlags?.port as number

    if (!port) {
      chrome = await launch({
        chromeFlags: ['--headless', ...(options.launchOptions?.chromeFlags || [])],
        ...options.launchOptions,
      })
      port = chrome.port
    }

    const config = options.lighthouseConfig || resolveLighthouseConfig(options)

    try {
      const result = await lighthouse(url, {
        port,
        output: 'json',
        logLevel: options.logLevel || 'info',
        ...options.lighthouseFlags,
      }, config)

      if (!result || !result.lhr) {
        throw new Error('Lighthouse failed to run')
      }

      return {
        url: result.lhr.requestedUrl || result.lhr.finalUrl || result.lhr.finalDisplayedUrl,
        fetchTime: result.lhr.fetchTime,
        insights: extractInsights(result.lhr),
        raw: result.lhr,
        artifacts: result.artifacts,
      }
    }
    finally {
      if (chrome) {
        await chrome.kill()
      }
    }
  }
}

export function createLocalAuditor(opts: LocalAuditorOptions = {}): Auditor {
  const provider = createLocalProvider()
  return {
    capabilities: LOCAL_CAPABILITIES,
    async audit(url: string, _page?: Page, _opts?: AuditOpts): Promise<LighthouseReport> {
      // @TODO v1.6: thread AbortSignal into chrome-launcher / lighthouse; reshape into real LighthouseReport via report/extract.
      const report = await provider(url, opts.defaults)
      return report.raw as unknown as LighthouseReport
    },
  }
}
