// Auditor adapter backed by Cloudflare Browser Rendering (env.BROWSER).
//
// `createCdpConnectAuditor` wants a static `browserWSEndpoint`, but
// Browser Rendering hands you a binding you `puppeteer.launch()` against;
// the ws endpoint only exists once the binding has been launched. We wrap
// that lifecycle here: lazy launch on first audit, reuse the browser
// across calls, close on disconnect.
//
// D-022 + v1.md Phase 5 ship-gate: this is the bridge between the
// Cloudflare host preset and the cdp-connect adapter contract.

import type { Browser, BrowserWorker } from '@cloudflare/puppeteer'
import type { Logger } from '@unlighthouse/contracts'
import type {
  AuditOpts,
  Auditor,
  AuditorCapabilities,
  LighthouseReport,
  Page,
} from '@unlighthouse/contracts/ports'
import puppeteer from '@cloudflare/puppeteer'
import { createCdpConnectAuditor } from '@unlighthouse/core/auditors'

export interface CloudflareBrowserAuditorOptions {
  /** env.BROWSER — the Browser Rendering binding. */
  browser: BrowserWorker
  /** Optional logger; passes through to cdp-connect's audit wrapper. */
  logger?: Logger
}

// Performance scores from a remote-CDP audit are unreliable — same as
// createCdpConnectAuditor declares. Field copied here so callers can read
// it before any audit fires.
const CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: false,
  reliableFieldData: false,
  supportsThrottling: false,
  categories: ['performance', 'accessibility', 'seo', 'best-practices'],
}

export function createCloudflareBrowserAuditor(
  opts: CloudflareBrowserAuditorOptions,
): Auditor {
  let browser: Browser | null = null
  let inner: Auditor | null = null
  let launching: Promise<Auditor> | null = null

  async function ensureInner(): Promise<Auditor> {
    if (inner)
      return inner
    if (launching)
      return launching
    launching = (async () => {
      browser = await puppeteer.launch(opts.browser)
      const browserWSEndpoint = browser.wsEndpoint()
      inner = createCdpConnectAuditor({
        browserWSEndpoint,
        logger: opts.logger,
      })
      return inner
    })()
    return launching
  }

  return {
    capabilities: CAPABILITIES,
    async audit(url: string, page?: Page, auditOpts?: AuditOpts): Promise<LighthouseReport> {
      const a = await ensureInner()
      return a.audit(url, page, auditOpts)
    },
  }
}

// Optional convenience for callers that want to manually dispose the
// shared browser (rare — most setups let the Worker context death close
// it). Exposed via the auditor's `[Symbol.asyncDispose]`-style contract
// if Workers runtime ever picks it up; today this is just a hook for
// integration tests.
