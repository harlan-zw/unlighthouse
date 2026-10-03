import type { Device, Scan } from '@unlighthouse/contracts'
import { siteSlug } from '../../utils/site'
import { devicesForScan } from './scan-pairs'

export interface LoadedComparison {
  base: Scan
  current: Scan
  device: Device
  to: string
}

function eligible(scan: Scan, device: Device): boolean {
  return scan.status === 'complete'
    && (scan.summary?.completed ?? 0) > 0
    && devicesForScan(scan).includes(device)
    && Number.isFinite(Date.parse(scan.startedAt))
}

function newestFirst(a: Scan, b: Scan): number {
  return Date.parse(b.startedAt) - Date.parse(a.startedAt) || a.scanId.localeCompare(b.scanId)
}

/** Links use only known loaded history. Absence does not prove no older scan exists. */
export function comparisonForLoadedScan(current: Scan, history: readonly Scan[], device: Device): LoadedComparison | null {
  if (!eligible(current, device) || !URL.canParse(current.site))
    return null
  const origin = new URL(current.site).origin
  const base = history.filter(candidate =>
    candidate.scanId !== current.scanId
    && eligible(candidate, device)
    && URL.canParse(candidate.site)
    && new URL(candidate.site).origin === origin
    && Date.parse(candidate.startedAt) < Date.parse(current.startedAt)
    && (!current.ciBranch || candidate.ciBranch === current.ciBranch),
  ).sort(newestFirst)[0]
  if (!base)
    return null
  const query = new URLSearchParams({ current: current.scanId, base: base.scanId, device })
  return { base, current, device, to: `/sites/${siteSlug(current.site)}/compare?${query}` }
}

export function latestLoadedComparison(history: readonly Scan[], device: Device): LoadedComparison | null {
  const current = history.filter(scan => eligible(scan, device)).sort(newestFirst)[0]
  return current ? comparisonForLoadedScan(current, history, device) : null
}
