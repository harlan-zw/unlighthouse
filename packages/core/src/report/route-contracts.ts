import type { BlobStore } from '@unlighthouse/contracts/ports'
import type { ScanRoute } from '@unlighthouse/contracts/types/atoms'

export interface RouteContract {
  categories: Record<string, { score: number | null, auditRefs: Array<{ id: string, weight: number }> }>
  audits: Record<string, {
    id: string
    score: number | null
    scoreDisplayMode: 'numeric' | 'binary' | 'informative' | 'manual' | 'notApplicable'
    displayValue: string | null
    title: string | null
    description: string | null
    severity: 'pass' | 'warn' | 'fail'
    metricSavings: { LCP?: number, FCP?: number, INP?: number, CLS?: number, TBT?: number } | null
    items: unknown[] | null
  }>
  provenance?: {
    lighthouseVersion: string
    userAgent: string | null
    capturedAt: string
    benchmarkIndex: number | null
    timingTotal: number | null
    warnings: string[]
    runtimeError: { code: string, message: string } | null
  }
  stackPacks?: Array<{ id: string, title: string, iconDataURL: string | null, descriptions: Record<string, string> }> | null
  entities?: Array<{ name: string, isFirstParty: boolean, origins: string[] }> | null
}

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
    return JSON.parse(new TextDecoder().decode(blob)) as RouteContract
  }
  catch {
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
