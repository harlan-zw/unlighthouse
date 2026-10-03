export interface UiNavStability {
  icon: string
  tooltip: string
}

export interface UiNavSetup {
  /**
   * One short imperative word naming what the user owes this row — "Connect",
   * "Confirm". Rendered verbatim in an outline chip, so anything longer than a
   * single word is a layout bug; the full state goes in `tooltip`.
   */
  verb: string
  tooltip: string
  tone?: 'primary' | 'warning'
}

export interface UiNavLink {
  label: string
  to: string
  icon?: string
  disabled?: boolean
  title?: string
  badge?: string
  badgeColor?: 'primary' | 'warning' | 'neutral'
  setup?: UiNavSetup | null
  stability?: UiNavStability | null
  pending?: boolean
  pendingTooltip?: string
  /** Optional text-tone lift for a small subset of peer navigation items. */
  textTone?: 'highlighted'
  active?: (path: string) => boolean
  /**
   * Opt out of NuxtLink's idle route-chunk prefetch. Set `false` on links to
   * explorer-sized routes (hundreds of KB) that sit in an always-visible nav —
   * the sidebar would otherwise pull them on every page view.
   */
  prefetch?: boolean
}
