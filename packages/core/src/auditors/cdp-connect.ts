import type { Logger } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, AuditorReport, Page } from '@unlighthouse/contracts/ports'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import lighthouse from 'lighthouse'
import puppeteer from 'puppeteer-core'
import { CDP_CONNECT_CATEGORIES } from './categories'
import { getScreenEmulation, getUserAgent } from './lighthouse-config'
import { attachExtractedRouteData } from './lighthouse-report'

export interface CdpConnectOptions {
  /** WebSocket endpoint of the remote Chrome (browserless, CF Browser Rendering, self-hosted, etc.) */
  browserWSEndpoint: string
  /** Optional auth headers (e.g. CF API token). */
  headers?: Record<string, string>
  /**
   * Override advertised capabilities when the remote browser does not expose
   * every Lighthouse 13 category or CDP domain that the generic adapter can run.
   */
  capabilities?: Partial<AuditorCapabilities>
  /** Test seam / advanced embedding: override the Puppeteer connector. */
  connect?: typeof puppeteer.connect
  /** Test seam / advanced embedding: override the Lighthouse runner. */
  runLighthouse?: LighthouseWithPage
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

// D-022: remote CDP can't produce reliable perf scores (network RTT contaminates LCP/TBT/SI).
// `categories` excludes 'performance' because callers should route perf elsewhere.
const CDP_CONNECT_CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: false,
  reliableFieldData: false,
  supportsThrottling: false,
  categories: [...CDP_CONNECT_CATEGORIES],
}

function resolveCapabilities(overrides?: Partial<AuditorCapabilities>): AuditorCapabilities {
  return {
    ...CDP_CONNECT_CAPABILITIES,
    ...overrides,
    categories: overrides?.categories ? [...overrides.categories] : [...CDP_CONNECT_CAPABILITIES.categories],
  }
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

type LighthouseWithPage = (
  url: string,
  flags?: unknown,
  config?: unknown,
  page?: unknown,
) => ReturnType<typeof lighthouse>

export function createCdpConnectAuditor(opts: CdpConnectOptions): Auditor {
  return {
    capabilities: resolveCapabilities(opts.capabilities),
    async audit(url: string, _page?: Page, auditOpts: AuditOpts = {}): Promise<AuditorReport> {
      const { signal } = auditOpts
      const connect = opts.connect ?? puppeteer.connect
      const browser = await connect({
        browserWSEndpoint: opts.browserWSEndpoint,
        headers: opts.headers,
      })
      try {
        const page = await browser.newPage()
        await withAbort(page.goto(url, { waitUntil: 'networkidle0' }), signal)

        // Lighthouse v11+ accepts a connected puppeteer Page as the 4th arg; port is omitted.
        const runLighthouse = opts.runLighthouse ?? lighthouse as unknown as LighthouseWithPage
        const formFactor = auditOpts.device ?? 'mobile'
        const flags = {
          output: 'json' as const,
          logLevel: 'error' as const,
          ...(auditOpts.lighthouseFlags ?? {}),
          formFactor,
          screenEmulation: getScreenEmulation(formFactor),
          emulatedUserAgent: getUserAgent(formFactor),
        }
        const result = await runLighthouse(url, flags, auditOpts.lighthouseConfig, page)
        if (!result || !result.lhr)
          throw new Error('Lighthouse failed to run against connected CDP page')
        return attachExtractedRouteData(result.lhr, url, 'cdp-connect')
      }
      finally {
        // CLOSE (not disconnect) so the remote Browser Run session is
        // TERMINATED right after the audit. `disconnect()` only detaches the
        // puppeteer client — the underlying session then lives out its full
        // `keep_alive` window (up to 10 min), so a ~30s audit was billed ~20x
        // its real time. Connecting to the bare `/browser` endpoint spawns a
        // NEW session per audit (no reuse), so those idle windows stacked up to
        // ~87 Browser-Run hours. close() bills ~the audit duration instead.
        // Fall back to disconnect() only if close() throws.
        await browser.close().catch(async (err) => {
          logOperationalWarn('auditor.cleanup_failed', err, { operation: 'remote-cdp browser.close' }, opts.logger)
          await Promise.resolve(browser.disconnect()).catch((disconnectErr) => {
            logOperationalWarn('auditor.cleanup_failed', disconnectErr, { operation: 'remote-cdp browser.disconnect' }, opts.logger)
          })
        })
      }
    },
  }
}
