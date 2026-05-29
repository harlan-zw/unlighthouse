import type { DevicePair, ScanRow } from '@/components/site/types'

// Mobile + desktop scans of the same exact URL started within this window are
// treated as one matrix scan and collapsed onto a single row.
const PAIR_WINDOW_MS = 5 * 60_000

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
