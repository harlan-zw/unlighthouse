// v1 core package — populated by v0.2–v0.7 module moves and v1 factory refactor.
export { createUnlighthouseCore, reapStaleScans } from './core'
export { persistStableEvents } from './persist-events'
// Per-URL audit + scan finalize, reusable outside the crawler loop (the
// Cloudflare ScanRunnerDO drives these per alarm tick).
export type { Device, EmitFn, FinalizeArgs, FinalizeDeps, RouteAuditArgs, RouteAuditDeps } from './scan/route-audit'
export { aggregateScores, auditRoute, finalizeScan } from './scan/route-audit'
// Site-id helpers — the Cloudflare ScanRunnerDO creates the scan row itself
// (it owns discovery off the crawler loop), so it needs the same site keying.
export { deriveSiteId, deriveSiteName, siteOrigin } from './util/site'
