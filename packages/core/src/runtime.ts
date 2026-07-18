// Host-runtime facade. This is deliberately narrower than the package root and
// excludes Node-only crawler/auditor barrels so Workers and other edge hosts do
// not bundle optional local-runtime dependencies.
export { createUnlighthouseCore, reapStaleScans } from './core'
export { createScanLifecycle } from './scan/lifecycle'
export type { CreateScanLifecycleOptions, ScanLifecycle, ScanLifecycleContext } from './scan/lifecycle'
export { pruneScans } from './scan/prune'
export type { PruneOptions, PruneReason, PruneResult, PruneScanDeletion, PruneSiteResult, Retention } from './scan/prune'
export { auditRoute } from './scan/route-audit'
export type { EmitFn, FinalizeArgs, FinalizeDeps, RouteAuditArgs, RouteAuditDeps } from './scan/route-audit'
