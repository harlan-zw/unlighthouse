// Concrete Page comes from puppeteer-core in auditors/local; ports stay puppeteer-free.
// LighthouseReport re-uses the type from contracts/types so adapters and the port agree.
import type { Category, Device, ExtractedMetrics } from '../types/atoms'

export type { Category, Device }

export interface LighthouseAuditDetailItem {
  [key: string]: unknown
  node?: {
    [key: string]: unknown
    selector?: string
    snippet?: string
    nodeLabel?: string
  }
  subItems?: {
    [key: string]: unknown
    items?: Array<{
      [key: string]: unknown
      reason?: string
    }>
  }
}

/**
 * Version-tolerant subset of a raw Lighthouse audit consumed by core.
 *
 * Auditor adapters may return a full upstream Lighthouse `Result`; this owned
 * contract deliberately names only fields used by extraction/reconciliation so
 * adapters for remote services and synthetic data do not need unsafe casts to a
 * particular Lighthouse package version.
 */
export interface LighthouseAuditResult {
  id?: string
  score: number | null
  scoreDisplayMode?: string
  numericValue?: number
  displayValue?: string
  explanation?: string
  title?: string
  description?: string
  metricSavings?: Partial<Record<'LCP' | 'FCP' | 'INP' | 'CLS' | 'TBT', number>>
  details?: {
    type?: string
    items?: LighthouseAuditDetailItem[]
    [key: string]: unknown
  }
}

/** Version-tolerant subset of a raw Lighthouse category consumed by core. */
export interface LighthouseCategoryResult {
  score: number | null
  title?: string
  id?: string
  categoryScoreDisplayMode?: 'gauge' | 'fraction'
  auditRefs?: Array<{ id: string, weight?: number }>
}

/** Raw Lighthouse-shaped payload accepted at the auditor port. */
export interface LighthouseResult {
  [key: string]: unknown
  lighthouseVersion: string
  requestedUrl: string
  finalUrl: string
  fetchTime?: string
  userAgent?: string
  categories: Record<string, LighthouseCategoryResult | undefined>
  audits: Record<string, LighthouseAuditResult>
  fullPageScreenshot?: {
    nodes?: Record<string, {
      id?: string
      left?: number
      top?: number
      width?: number
      height?: number
    }>
    screenshot?: {
      data?: string
    }
  } | null
  stackPacks?: Array<{
    id: string
    title: string
    iconDataURL?: string
    descriptions?: Record<string, string>
  }>
  entities?: Array<{
    name: string
    isFirstParty?: boolean
    origins?: string[]
  }>
  timing?: { total?: number }
  runtimeError?: { code?: string, message?: string }
  runWarnings?: string[]
  environment?: { benchmarkIndex?: number }
}

/**
 * Canonical result returned by every Auditor.
 *
 * Core-owned enrichment fields live here instead of being recovered with
 * double assertions at each consumer.
 */
export interface AuditorReport extends LighthouseResult {
  extracted?: ExtractedMetrics
  lhrGzip?: Uint8Array
  auditor?: string
  auditors?: Record<string, string>
  concurrency?: number
}

export interface Page {
  url: () => string
}

export interface AuditorCapabilities {
  /** false for remote-CDP: network RTT contaminates LCP/TBT/SI. */
  reliablePerfScores: boolean
  /** true for CrUX (real field data); false for lab. */
  reliableFieldData: boolean
  /** false for fetch-based adapters (PSI, CrUX, dataforseo). */
  supportsThrottling: boolean
  categories: Category[]
}

export interface AuditOpts {
  signal?: AbortSignal
  /**
   * D-029: device form-factor for this audit. Adapters that run Lighthouse
   * pass it through as the emulation profile (`mobile` → moto-g4 + 4G,
   * `desktop` → 1366×768 + wired). Fetch-based aggregators ignore it; the
   * scan still records which device the URL was queried under.
   *
   * Defaults to `'mobile'` when omitted, matching Lighthouse's own default.
   */
  device?: Device
  /**
   * Lighthouse config passthrough for adapters that run Lighthouse (local, cdp-connect,
   * remote-lighthouse). Ignored by fetch-based aggregators (psi, crux, dataforseo).
   * Shape matches Lighthouse's `Config` type; kept loose here so contracts stays
   * lighthouse-free.
   */
  lighthouseConfig?: Record<string, unknown>
  /**
   * Lighthouse flags/settings passthrough (`onlyCategories`, throttling, etc.).
   * Kept separate from `lighthouseConfig` because Lighthouse's JS API accepts
   * flags as the second argument and config as the third.
   */
  lighthouseFlags?: Record<string, unknown>
  /**
   * D-040: sample-group position when `samples > 1`. A router (`routeAuditors`)
   * uses it to pin the picked backend for a whole sample group — index 0 picks,
   * later indexes reuse — so `computeMedianRun` never mixes measurement
   * conditions (local hardware vs PSI datacenter). Absent for single audits.
   */
  sample?: { index: number, total: number }
}

/** Wire contract shared by the Worker adapter and Lighthouse container. */
export interface LighthouseAuditRequest {
  url: string
  config?: Record<string, unknown>
  flags?: Record<string, unknown>
  device?: Device
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseLighthouseAuditRequest(value: unknown): LighthouseAuditRequest {
  if (
    !isRecord(value)
    || typeof value.url !== 'string'
    || value.url.length === 0
    || (value.config !== undefined && !isRecord(value.config))
    || (value.flags !== undefined && !isRecord(value.flags))
    || (value.device !== undefined && value.device !== 'mobile' && value.device !== 'desktop')
  ) {
    throw new TypeError('Expected a Lighthouse audit request with a URL and valid audit options.')
  }
  return {
    url: value.url,
    config: value.config,
    flags: value.flags,
    device: value.device,
  }
}

export interface Auditor {
  audit: (url: string, page?: Page, opts?: AuditOpts) => Promise<AuditorReport>
  // Read at construction; router `pick` functions consult this for per-category routing.
  readonly capabilities: AuditorCapabilities
}

// Router is a composer that *is* an Auditor — core never knows it isn't concrete.
// Shape is here for type alignment; the implementation lives in @unlighthouse/core/auditors/route.
export interface NamedAuditor {
  name: string
  auditor: Auditor
}

export interface AuditorRouterOptions {
  auditors: NamedAuditor[]
  pick: (
    auditors: NamedAuditor[],
    ctx: { url: string, auditOpts?: AuditOpts, requestedCategories?: string[] },
  ) => Auditor | Promise<Auditor>
}
