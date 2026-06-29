// Shared types for the multi-site/multi-device history UI.
// Co-located in `app/components/site/` so the history page and the
// SiteHistoryTable component reference the *same* nominal type instead
// of two structurally-identical declarations (which TS treats as
// incompatible across SFCs).

import type { Scan } from '@unlighthouse/contracts'

// Re-export the persisted Scan shape so UI code stops re-declaring a
// thinner version (and stops `as any`-ing the CI fields it didn't
// know existed). The local alias name preserves the existing
// import/use sites while the underlying type is now the canonical
// contract type.
export type ScanRow = Scan

/**
 * A history row paired across the device matrix.
 *  When mobile + desktop scans of the same site started within ~5 min,
 *  they collapse into one row with both score halves filled.
 */
export interface DevicePair {
  startedAt: string
  routes: number
  completed: number
  mobile: ScanRow | null
  desktop: ScanRow | null
}
