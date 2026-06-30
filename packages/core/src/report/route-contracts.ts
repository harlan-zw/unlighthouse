import type { BlobStore } from '@unlighthouse/contracts/ports'
import type { ReconciledReport, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { ReconciledReportSchema } from '@unlighthouse/contracts/types/atoms'

export type RouteContract = ReconciledReport

export function routeContractBlobKeyForReport(reportBlobKey: string | null | undefined): string | null {
  if (!reportBlobKey)
    return null
  return reportBlobKey.replace('.json', '.contract.json')
}

export function routeContractBlobKey(route: Pick<ScanRoute, 'reportBlobKey'>): string | null {
  return routeContractBlobKeyForReport(route.reportBlobKey)
}

export function parseRouteContract(blob: Uint8Array): RouteContract | null {
  try {
    return ReconciledReportSchema.parse(JSON.parse(new TextDecoder().decode(blob)))
  }
  catch (_err) {
    // Corrupt or non-JSON contract blobs are treated as cache misses.
    return null
  }
}

export async function loadRouteContract(blobs: BlobStore, route: Pick<ScanRoute, 'reportBlobKey'>): Promise<RouteContract | null> {
  const key = routeContractBlobKey(route)
  if (!key)
    return null
  const blob = await blobs.get(key)
  return blob ? parseRouteContract(blob) : null
}
