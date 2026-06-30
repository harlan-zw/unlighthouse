// Report module — v2 exports.
// Dashboard aggregation tables have been removed; all cross-route analysis
// now flows through the pack system (see core/packs/). The processScanData
// function is retained as a no-op for backward compatibility — existing
// callers won't break, but the work happens in core.ts (auto-pack-run)
// at scan completion time instead.

import type { Storage } from '@unlighthouse/contracts'

export { decompressLhr, extractRouteData, reconcileRoute, reconcileToContract } from './extract'
export * from './types'

export interface ProcessScanDataOptions {
  compare?: boolean
  thresholds?: Record<string, number>
}

/**
 * @deprecated Dashboard aggregation tables have been removed.
 * Pack reports are now generated automatically at scan completion time
 * in core.ts. This function is a no-op retained for backward compatibility.
 */
export async function processScanData(
  _storage: Storage,
  _scanId: string,
  _options: ProcessScanDataOptions = {},
): Promise<null> {
  return null
}

/**
 * @deprecated Use pack.run('overview') or read from PackRunRepository instead.
 */
export async function getDashboardSummary(
  _storage: Storage,
  _scanId: string,
): Promise<null> {
  return null
}
