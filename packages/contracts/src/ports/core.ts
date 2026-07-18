import type { Hookable } from 'hookable'
import type { UnlighthouseConfig } from '../config/index'
import type { HookEvent, UnlighthouseHooks } from '../hooks/index'
// (UnlighthouseHooks now sourced from contracts/hooks, not the legacy types/index shim.)
import type { Pack } from '../packs'
import type { Auditor } from './auditor'
import type { Crawler } from './crawler'
import type { SeedSource } from './seed-source'
import type { Device, DeviceMatrix, ScanId, ScanStatus, ScanSummary, Storage } from './storage'

export type { HookEvent, UnlighthouseConfig }
// Structural shape matching ConsolaInstance's used surface. Type-only so
// the ports subpath has zero runtime deps. Presets pass a real ConsolaInstance.
export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  log: (...args: unknown[]) => void
  success: (...args: unknown[]) => void
  trace: (...args: unknown[]) => void
  withTag: (tag: string) => Logger
  level?: number
}

export interface UnlighthouseCoreOptions {
  /** Already-resolved by the host (c12/env merge + imperative rules); validated by Zod inside. */
  config: UnlighthouseConfig
  /** Single; may be an AuditorRouter — core never knows the difference. */
  auditor: Auditor
  /** Single; may be fuseSeeds([sitemap, manual, ...]). */
  seeds: SeedSource
  /**
   * D-039: resolve a URL to its route template's `routeName` (template
   * grouping). Applied at ingest to fill the `routeName` column when the
   * auditor did not already stamp one. Supplied by the host from
   * `seeds/route-definitions` (Node-only); absent = every row's `routeName`
   * stays null. Must be synchronous — called once per audited route.
   */
  routeMatcher?: (url: string) => string | null
  /** Single; parallel-map / crawlee / user-supplied. */
  crawler: Crawler
  storage: Storage
  /**
   * Third-party packs to register alongside the built-ins. Runtime objects
   * (their reconcilers are closures), so they live here on the factory opts,
   * not in the Zod-validated `config`. Merged over the built-in registry by
   * name — a user pack that reuses a built-in name overrides it.
   */
  packs?: Pack[]
  /** Additive subscribers; merged into the hook bus. */
  hooks?: Partial<UnlighthouseHooks>
  /** Tagged loggers per adapter derived via logger.withTag(name). */
  logger?: Logger
}

export interface CrawlStats {
  discovered: number
  scanned: number
  failed: number
  total: number
}

export interface CrawlSession {
  scanId: ScanId
  /** Typed HookMap union; host fan-outs from here. */
  events: AsyncIterable<HookEvent>
  subscribe: (handler: (event: HookEvent) => void) => () => void
  /** Return the last `min(n, ring.length)` buffered events (in-memory ring, cap 10k). */
  replay: (n: number) => HookEvent[]
  /** Derived from whether the crawler implements pause/resume. */
  capabilities: { pausable: boolean }
  /** Delegates to crawler.pause(); throws NOT_SUPPORTED when absent. */
  pause: () => Promise<void>
  resume: () => Promise<void>
  /** Wired to AbortController; propagates to Auditor.audit({ signal }). */
  cancel: (reason?: string) => Promise<void>
  state: () => ScanStatus
  stats: () => CrawlStats
  done: Promise<{ scanId: ScanId, summary: ScanSummary }>
}

/**
 * Per-run config overrides. Merged on top of the host-supplied `config` for the
 * lifetime of a single session — lets API callers (`scan.start`) thread the
 * command input (site/device/categories/auditor/ciBuild) into the scan without
 * mutating shared `Core` state. The overrides do not persist beyond the session.
 */
export interface UnlighthouseCoreRunOverrides {
  site?: string
  /**
   * D-029: device form-factor for the scan. A single value runs once per URL;
   * an array runs the matrix — one audit per URL per device, all under one
   * scan id. Defaults to the host config's device when omitted.
   */
  device?: Device | DeviceMatrix
  /**
   * Scan mode. `page` audits only the seeded URL(s) (no link-following);
   * `site` crawls. Defaults to the host config's `scanner.mode` when omitted.
   * Lets the dashboard's per-scan "single page" toggle reach the crawler.
   */
  mode?: 'site' | 'page'
  /** Lighthouse categories — mapped onto `lighthouseOptions.onlyCategories`. */
  categories?: Array<'performance' | 'accessibility' | 'seo' | 'best-practices' | 'agentic-browsing'>
  /** Sample count — mapped onto `scanner.samples`. */
  sampleSize?: number
  /** Auditor provider name — selects from `config.auditor` when it's a router. */
  auditor?: string
  /** CI metadata persisted on the scans row. */
  ciBuild?: {
    branch?: string
    hash?: string
    message?: string
  }
}

export interface UnlighthouseCoreRunOptions {
  signal?: AbortSignal
  overrides?: UnlighthouseCoreRunOverrides
}

export interface UnlighthouseCore {
  /** Single-session: throws ACTIVE_SCAN_CONFLICT if a session is already in flight. */
  run: (opts?: UnlighthouseCoreRunOptions) => CrawlSession
  session: () => CrawlSession | null
  hooks?: Hookable<UnlighthouseHooks>
}

export type CreateUnlighthouseCore = (opts: UnlighthouseCoreOptions) => UnlighthouseCore
