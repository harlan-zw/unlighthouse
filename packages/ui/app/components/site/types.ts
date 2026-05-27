// Shared types for the multi-site/multi-device history UI.
// Co-located in `app/components/site/` so the history page and the
// SiteHistoryTable component reference the *same* nominal type instead
// of two structurally-identical declarations (which TS treats as
// incompatible across SFCs).

export interface ScanRow {
  scanId: string
  site: string
  device: 'mobile' | 'desktop'
  status: string
  startedAt: string
  summary?: {
    routes?: number
    completed?: number
    scoresByCategory?: Record<string, number | null>
  } | null
}

/** A history row paired across the device matrix.
 *  When mobile + desktop scans of the same site started within ~5 min,
 *  they collapse into one row with both score halves filled. */
export interface DevicePair {
  startedAt: string
  routes: number
  completed: number
  mobile: ScanRow | null
  desktop: ScanRow | null
}
