import type { BlobStore, PackRunRepository, ScanRepository, ScanRouteRepository, SiteRepository, Storage } from '@unlighthouse/contracts'

export interface CreateStorageOptions {
  rows: {
    sites: SiteRepository
    scans: ScanRepository
    routes: ScanRouteRepository
    /** Drizzle adapter exposes report repos + raw db handle; memory omits. */
    reports?: Storage['reports']
    comparisons?: Storage['comparisons']
    packRuns: PackRunRepository
    db?: unknown
  }
  blobs: BlobStore
}

/**
 * Compose row + blob halves into a `Storage`. Trivial; exists so callers
 * don't reach into individual adapter return shapes.
 */

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
    sites: opts.rows.sites,
    scans: opts.rows.scans,
    routes: opts.rows.routes,
    blobs: opts.blobs,
    reports: opts.rows.reports ?? emptyReports,
    comparisons: opts.rows.comparisons ?? emptyComparisons,
    packRuns: opts.rows.packRuns,
    // Internal escape hatch for assertions and comparison queries.
    // Exposed as `unknown` on the Storage contract; callers must narrow.
    ...(opts.rows.db !== undefined ? { db: opts.rows.db } : {}),
  } as Storage
}
