import type { Device, Scan, ScanSummary } from '@unlighthouse/contracts'

// Re-export the persisted Scan shape so UI code stops re-declaring a thinner
// version and the history table, dashboard, and pairing logic share one
// nominal type.
export type ScanRow = Scan

/**
 * A history row paired across the device matrix.
 * When mobile + desktop scans of the same site started within ~5 min,
 * they collapse into one row with both score halves filled.
 */
export interface DevicePair {
  startedAt: string
  routes: number
  completed: number
  mobile: ScanRow | null
  desktop: ScanRow | null
}

export interface PairStatus {
  label: string
  status: 'success' | 'error' | 'warning' | 'info' | 'neutral'
}

export function statusForPair(pair: DevicePair): PairStatus {
  const statuses = [pair.mobile?.status, pair.desktop?.status]
  if (statuses.includes('cancelled'))
    return { label: 'cancelled', status: 'warning' }
  if (statuses.includes('error'))
    return { label: 'failed', status: 'error' }
  if (statuses.includes('paused'))
    return { label: 'paused', status: 'warning' }
  if (statuses.some(status => status === 'scanning' || status === 'discovering' || status === 'starting'))
    return { label: statuses.find(Boolean) ?? 'pending', status: 'info' }

  const scans = [pair.mobile, pair.desktop].filter(scan => scan !== null)
  if (statuses.includes('complete')) {
    const completed = scans.reduce((total, scan) => total + (scan.summary?.completed ?? 0), 0)
    return completed > 0
      ? { label: 'complete', status: 'success' }
      : { label: 'no data', status: 'neutral' }
  }
  return { label: statuses.find(Boolean) ?? 'pending', status: 'neutral' }
}

// Mobile + desktop scans of the same exact URL started within this window are
// treated as one matrix scan and collapsed onto a single row.
const PAIR_WINDOW_MS = 5 * 60_000

export function devicesForScan(scan: ScanRow): Device[] {
  return scan.summary?.devices?.length ? [...scan.summary.devices] : [scan.device]
}

export function hasMultipleDevicesForScans(scans: Array<{ device: Device, summary?: { devices?: Device[] } | null } | null | undefined>): boolean {
  const devices = new Set(scans.flatMap(scan => scan ? (scan.summary?.devices?.length ? scan.summary.devices : [scan.device]) : []))
  return devices.size > 1
}

export function deviceLabelForScan(scan: { device: Device, summary?: { devices?: Device[] } | null }): Device | 'both' {
  return (scan.summary?.devices?.length ?? 0) > 1 ? 'both' : scan.device
}

export function scoreSummaryForDevice(scan: ScanRow, device: Device): Pick<ScanSummary, 'scoreAverage' | 'scoresByCategory' | 'categoryScoreDisplayModes'> | null {
  const byDevice = scan.summary?.scoresByDevice?.[device]
  if (byDevice)
    return byDevice
  // Summaries written before per-device rollups are only safe to attribute to
  // the scan row's primary device. Do not duplicate an aggregate matrix score.
  return scan.device === device ? scan.summary : null
}

/**
 * Collapse a flat list of scans into device pairs: a mobile and a desktop scan
 * of the same URL started within ~5 min merge into one row with both score
 * halves filled. Extracted from history.vue so the per-site page reuses the
 * exact same pairing rather than re-deriving it.
 *
 * Pure + order-stable: returns pairs sorted newest-first.
 */
export function pairScans(scans: ScanRow[]): DevicePair[] {
  const sorted = [...scans].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const used = new Set<string>()
  const pairs: DevicePair[] = []

  for (const scan of sorted) {
    if (used.has(scan.scanId))
      continue
    used.add(scan.scanId)

    const devices = devicesForScan(scan)
    if (devices.length > 1) {
      pairs.push({
        startedAt: scan.startedAt,
        routes: scan.summary?.routes ?? 0,
        completed: scan.summary?.completed ?? 0,
        mobile: devices.includes('mobile') ? scan : null,
        desktop: devices.includes('desktop') ? scan : null,
      })
      continue
    }

    const otherDevice = scan.device === 'mobile' ? 'desktop' : 'mobile'
    const tsScan = new Date(scan.startedAt).getTime()
    const sibling = sorted.find((s) => {
      if (used.has(s.scanId))
        return false
      if (s.site !== scan.site)
        return false
      if (s.device !== otherDevice)
        return false
      return Math.abs(new Date(s.startedAt).getTime() - tsScan) <= PAIR_WINDOW_MS
    })
    if (sibling)
      used.add(sibling.scanId)

    pairs.push({
      startedAt: scan.startedAt > (sibling?.startedAt ?? '') ? scan.startedAt : (sibling?.startedAt ?? scan.startedAt),
      routes: Math.max(scan.summary?.routes ?? 0, sibling?.summary?.routes ?? 0),
      completed: Math.max(scan.summary?.completed ?? 0, sibling?.summary?.completed ?? 0),
      mobile: scan.device === 'mobile' ? scan : (sibling?.device === 'mobile' ? sibling : null),
      desktop: scan.device === 'desktop' ? scan : (sibling?.device === 'desktop' ? sibling : null),
    })
  }

  return pairs
}
