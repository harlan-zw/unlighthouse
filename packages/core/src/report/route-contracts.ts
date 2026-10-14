import type { BlobStore } from '@unlighthouse/contracts/ports'
import type { ReconciledReport, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { ReconciledReportSchema } from '@unlighthouse/contracts/types/atoms'
import { decompressLhr, reconcileToContract } from './extract'

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
    const report = ReconciledReportSchema.parse(JSON.parse(new TextDecoder().decode(blob)))
    if (report.schemaVersion !== 2) {
      for (const audit of Object.values(report.audits)) {
        // Earlier projections erased error and metricSavings modes. Their raw
        // meaning cannot be recovered from an informative label alone.
        if (audit.scoreDisplayMode === 'informative')
          audit.scoreDisplayMode = 'unknown'
        if (['unknown', 'manual', 'notApplicable', 'error'].includes(audit.scoreDisplayMode))
          audit.severity = null
      }
    }
    return report
  }
  catch (_err) {
    // Corrupt or non-JSON contract blobs are treated as cache misses.
    return null
  }
}

export async function loadRouteContract(blobs: BlobStore, route: ScanRoute): Promise<RouteContract | null> {
  const key = routeContractBlobKey(route)
  const blob = key ? await blobs.get(key) : null
  const report = blob ? parseRouteContract(blob) : null
  if (report?.schemaVersion === 2)
    return report
  const raw = route.lhrBlobKey ? await blobs.get(route.lhrBlobKey) : null
  if (raw) {
    return reconcileToContract({ scanId: route.scanId, url: route.url, device: route.device, lhr: decompressLhr(raw), auditor: route.auditor, auditors: report?.provenance.auditors, concurrency: report?.provenance.concurrency, capturedAt: route.capturedAt })
  }
  return report
}
