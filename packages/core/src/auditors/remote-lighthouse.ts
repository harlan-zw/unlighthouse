import type { Logger } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, AuditorReport, Page } from '@unlighthouse/contracts/ports'
import { ofetch } from 'ofetch'
import { LIGHTHOUSE_DEFAULT_CATEGORIES } from './categories'
import { assertLighthouseResult, attachExtractedRouteData } from './lighthouse-report'

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
   * Replace the default request/response mapping. Receives the URL, Lighthouse config,
   * flags, and device the caller wants applied and must return a parsed LHR. Use this for vendors whose
   * request body shape diverges from `{ url, config }`.
   */
  transport?: (req: RemoteLighthouseRequest) => Promise<AuditorReport>
  /**
   * Override advertised capabilities when a vendor runs an older Lighthouse or
   * ignores categories/features such as LH13 agentic browsing.
   */
  capabilities?: Partial<AuditorCapabilities>
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

export interface RemoteLighthouseRequest {
  endpoint: string
  url: string
  lighthouseConfig: Record<string, unknown>
  lighthouseFlags: Record<string, unknown>
  device?: AuditOpts['device']
  token?: string
  headers?: Record<string, string>
  timeoutMs: number
  signal?: AbortSignal
}

const REMOTE_LIGHTHOUSE_CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: true,
  reliableFieldData: false,
  supportsThrottling: true,
  categories: [...LIGHTHOUSE_DEFAULT_CATEGORIES],
}

function resolveCapabilities(overrides?: Partial<AuditorCapabilities>): AuditorCapabilities {
  return {
    ...REMOTE_LIGHTHOUSE_CAPABILITIES,
    ...overrides,
    categories: overrides?.categories ? [...overrides.categories] : [...REMOTE_LIGHTHOUSE_CAPABILITIES.categories],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function defaultTransport(req: RemoteLighthouseRequest): Promise<AuditorReport> {
  const response: unknown = await ofetch(req.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...req.headers },
    query: req.token ? { token: req.token } : undefined,
    body: {
      url: req.url,
      config: req.lighthouseConfig,
    },
    timeout: req.timeoutMs,
    signal: req.signal,
  })
  if (!isRecord(response))
    return assertLighthouseResult(response)

  // Browserless-compatible endpoints may omit URL fields even though the
  // requested URL is already authoritative at this transport boundary.
  return assertLighthouseResult({
    ...response,
    requestedUrl: typeof response.requestedUrl === 'string' ? response.requestedUrl : req.url,
    finalUrl: typeof response.finalUrl === 'string' ? response.finalUrl : req.url,
  })
}

export function createRemoteLighthouseAuditor(opts: RemoteLighthouseOptions): Auditor {
  const transport = opts.transport ?? defaultTransport
  const timeoutMs = opts.timeoutMs ?? 120_000
  return {
    capabilities: resolveCapabilities(opts.capabilities),
    async audit(url: string, _page?: Page, auditOpts: AuditOpts = {}): Promise<AuditorReport> {
      const lighthouseConfig = auditOpts.lighthouseConfig ?? {}
      const lighthouseFlags = auditOpts.lighthouseFlags ?? {}
      const lhr = await transport({
        endpoint: opts.endpoint,
        url,
        lighthouseConfig,
        lighthouseFlags,
        device: auditOpts.device,
        token: opts.token,
        headers: opts.headers,
        timeoutMs,
        signal: auditOpts.signal,
      })
      // The remote service returns a raw LHR. Run the canonical extraction here
      // and attach `.extracted` (the scored metrics row) + `.lhrGzip`, exactly
      // like the local auditor — without this, the persist path (auditRoute)
      // finds no `.extracted` and writes a row with all scores null, so the
      // dashboard shows the routes with no numbers. Mirrors local.ts.
      return attachExtractedRouteData(lhr, url, 'remote-lighthouse')
    },
  }
}
