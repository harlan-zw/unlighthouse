import type { UnlighthouseConfig } from '../config/index'
import type { PackRun } from '../packs/index'
import type { SiteRecord } from '../ports/storage'
import type { Scan, ScanRoute } from './atoms'
import type { ClientOptionsPayload, ScanMeta, StaticScreenshotMap } from './index'

// Wire payloads shared by browser and backend transports. Owned by contracts
// so producers and consumers agree on the shape without importing an
// implementation package for types.

export interface ScanProgress {
  discovered: number
  scanned: number
  failed: number
  total: number
  percent: number
}

export interface CompletedRoute {
  path: string
  score: number
  categories?: Record<string, { score: number, title: string }>
}

/**
 * Self-contained snapshot embedded into a static build. It carries everything
 * the offline command client needs to answer dashboard reads without a server.
 */
export interface StaticSnapshot {
  scans: Scan[]
  routes: ScanRoute[]
  /** Blob key to UTF-8 JSON content. */
  blobs: Record<string, string>
  packRuns: PackRun[]
  sites: SiteRecord[]
  config: UnlighthouseConfig
  version?: string
}

/** Payload written to `window.__unlighthouse_payload` by the host build. */
export interface ClientRuntimePayload {
  options: ClientOptionsPayload
  scanMeta: ScanMeta
  reports: ScanRoute[]
  snapshot?: StaticSnapshot
  screenshots?: StaticScreenshotMap
}
