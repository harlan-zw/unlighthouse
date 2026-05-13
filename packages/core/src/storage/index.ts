import type { BlobStore, ScanRepository, ScanRouteRepository, Storage } from '@unlighthouse/contracts'

export interface CreateStorageOptions {
  rows: {
    scans: ScanRepository
    routes: ScanRouteRepository
    /** Drizzle adapter exposes report repos + raw db handle; memory omits. */
    reports?: Storage['reports']
    comparisons?: Storage['comparisons']
    db?: unknown
  }
  blobs: BlobStore
}

/**
 * Compose row + blob halves into a `Storage`. Trivial; exists so callers
 * don't reach into individual adapter return shapes.
 */
export * from './wrap'

const emptyReports: Storage['reports'] = (() => {
  const emptyList = { list: async () => [] }
  return {
    accessibility: emptyList,
    accessibilityElements: emptyList,
    missingAltImages: emptyList,
    performance: emptyList,
    thirdPartyScripts: emptyList,
    lcpElements: emptyList,
    seoMeta: emptyList,
    seoDuplicates: emptyList,
    canonicalChains: emptyList,
    linkTextIssues: emptyList,
    tapTargetIssues: emptyList,
    bestPracticesSecurity: emptyList,
    bestPracticesLibraries: emptyList,
    bestPracticesVulnerable: emptyList,
    bestPracticesDeprecated: emptyList,
    bestPracticesConsoleErrors: emptyList,
    crux: emptyList,
    dashboardSummary: { get: async () => null },
  }
})()

const emptyComparisons: Storage['comparisons'] = {
  async list() { return [] },
  async get() { return null },
  async latestForCurrent() { return null },
  async diffs() { return [] },
}

export function createStorage(opts: CreateStorageOptions): Storage {
  return {
    scans: opts.rows.scans,
    routes: opts.rows.routes,
    blobs: opts.blobs,
    reports: opts.rows.reports ?? emptyReports,
    comparisons: opts.rows.comparisons ?? emptyComparisons,
    // Internal escape hatch for processScanData / assertions / compareScans.
    // Not part of the contract; read-via-`as { db?: any }` at call sites.
    ...(opts.rows.db !== undefined ? { db: opts.rows.db } : {}),
  } as Storage
}
