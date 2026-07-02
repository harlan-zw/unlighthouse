// v1 core package — populated by v0.2–v0.7 module moves and v1 factory refactor.
export { createUnlighthouseCore, reapStaleScans } from './core'
export { persistStableEvents } from './persist-events'
// D-044: retention pruning, pure over the Storage port.
export type { PruneOptions, PruneReason, PruneResult, PruneScanDeletion, PruneSiteResult, Retention } from './scan/prune'
export { pruneScans } from './scan/prune'
// Per-URL audit + scan finalize, reusable outside the crawler loop (the
// Cloudflare ScanRunnerDO drives these per alarm tick).
export type { EmitFn, FinalizeArgs, FinalizeDeps, RouteAuditArgs, RouteAuditDeps } from './scan/route-audit'
export { aggregateScores, auditRoute, finalizeScan, toStructuredError } from './scan/route-audit'
// Site-id helpers — the Cloudflare ScanRunnerDO creates the scan row itself
// (it owns discovery off the crawler loop), so it needs the same site keying.
export { deriveSiteId, deriveSiteName, siteOrigin } from './util/site'
export type { Device } from '@unlighthouse/contracts'
