import type { Logger } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, LighthouseReport, Page } from '@unlighthouse/contracts/ports'
import { ofetch } from 'ofetch'

// Generic remote-Lighthouse adapter. The remote service runs Lighthouse on its own
// hardware and returns the raw LHR — unlike cdp-connect (D-022), perf scores are
// reliable because there's no internet RTT between Chrome and Lighthouse.
//
// Shape matches Browserless.io `/performance` (POST { url, config } → LHR). Self-hosted
// LH servers and compatible vendors use the same contract. For non-conforming services,
// pass `transport` to control the request/response mapping.

export interface RemoteLighthouseOptions {
  /** Full URL of the remote endpoint, e.g. https://chrome.browserless.io/performance */
  endpoint: string
  /** Auth token. Sent as `?token=` by default (Browserless convention); override via `transport`. */
  token?: string
  /** Extra headers attached to the request. */
  headers?: Record<string, string>
  /** Per-request timeout in ms. Default 120_000. */
  timeoutMs?: number
  /**
   * Replace the default request/response mapping. Receives the URL + lighthouseConfig
   * the caller wants applied and must return a parsed LHR. Use this for vendors whose
   * request body shape diverges from `{ url, config }`.
   */
  transport?: (req: RemoteLighthouseRequest) => Promise<LighthouseReport>
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

export interface RemoteLighthouseRequest {
  endpoint: string
  url: string
  lighthouseConfig: Record<string, unknown>
  token?: string
  headers?: Record<string, string>
  timeoutMs: number
  signal?: AbortSignal
}

const REMOTE_LIGHTHOUSE_CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: true,
  reliableFieldData: false,
  supportsThrottling: true,
  categories: ['performance', 'accessibility', 'seo', 'best-practices'],
}

async function defaultTransport(req: RemoteLighthouseRequest): Promise<LighthouseReport> {
  const lhr = await ofetch(req.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...req.headers },
    query: req.token ? { token: req.token } : undefined,
    body: { url: req.url, config: req.lighthouseConfig },
    timeout: req.timeoutMs,
    signal: req.signal,
  })
  if (!lhr || typeof lhr !== 'object' || !('categories' in lhr))
    throw new Error('Remote Lighthouse returned an invalid LHR')
  return lhr as LighthouseReport
}

export function createRemoteLighthouseAuditor(opts: RemoteLighthouseOptions): Auditor {
  const transport = opts.transport ?? defaultTransport
  const timeoutMs = opts.timeoutMs ?? 120_000
  return {
    capabilities: REMOTE_LIGHTHOUSE_CAPABILITIES,
    async audit(url: string, _page?: Page, auditOpts: AuditOpts = {}): Promise<LighthouseReport> {
      const lighthouseConfig = auditOpts.lighthouseConfig ?? {}
      return transport({
        endpoint: opts.endpoint,
        url,
        lighthouseConfig,
        token: opts.token,
        headers: opts.headers,
        timeoutMs,
        signal: auditOpts.signal,
      })
    },
  }
}
