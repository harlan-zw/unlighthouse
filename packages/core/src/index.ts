// v1 core package — populated by v0.2–v0.7 module moves and v1 factory refactor.
export { createUnlighthouseCore, reapStaleScans } from './core'
export { persistStableEvents } from './persist-events'
export { createScanLifecycle } from './scan/lifecycle'
export type { CreateScanLifecycleOptions, ScanLifecycle, ScanLifecycleContext } from './scan/lifecycle'
// D-044: retention pruning, pure over the Storage port.
export type { PruneOptions, PruneReason, PruneResult, PruneScanDeletion, PruneSiteResult, Retention } from './scan/prune'
export { pruneScans } from './scan/prune'
// Per-URL audit + scan finalize, reusable outside the crawler loop (the
// Cloudflare Workflows drive these per durable step).
export type { EmitFn, FinalizeArgs, FinalizeDeps, RouteAuditArgs, RouteAuditDeps } from './scan/route-audit'
export { aggregateScores, auditRoute, finalizeScan, toStructuredError } from './scan/route-audit'
export type { Device } from '@unlighthouse/contracts'
