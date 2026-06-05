/**
 * Curated semantic icon registry for UiButton.
 *
 * Buttons reference icons by *role* (`refresh`, `next`, `delete`), not by raw
 * iconify name. This forces one canonical icon per concept — no more
 * `i-lucide-arrow-right` vs `i-carbon-arrow-right` drift — and keeps the icon
 * set small enough to autocomplete.
 *
 * A raw `i-*` string still passes through unchanged (escape hatch for the
 * long-tail one-offs and dynamic `:icon` bindings), so adoption is incremental.
 */

export const UI_ICONS = {
  // navigation
  'next': 'i-lucide-arrow-right',
  'back': 'i-lucide-arrow-left',
  'up': 'i-lucide-arrow-up',
  'down': 'i-lucide-arrow-down',
  'external': 'i-lucide-external-link',
  'expand': 'i-lucide-chevron-down',
  'collapse': 'i-lucide-chevron-up',
  'chevron-right': 'i-lucide-chevron-right',
  // crud / actions
  'add': 'i-lucide-plus',
  'close': 'i-lucide-x',
  'delete': 'i-lucide-trash-2',
  'edit': 'i-lucide-pencil',
  'copy': 'i-lucide-copy',
  'check': 'i-lucide-check',
  'refresh': 'i-lucide-refresh-cw',
  'search': 'i-lucide-search',
  'download': 'i-lucide-download',
  'upload': 'i-lucide-upload',
  'send': 'i-lucide-send',
  'save': 'i-lucide-save',
  'filter': 'i-lucide-list-filter',
  'settings': 'i-lucide-settings',
  'more': 'i-lucide-ellipsis-vertical',
  'more-horizontal': 'i-lucide-more-horizontal',
  // status / meta
  'info': 'i-lucide-info',
  'warning': 'i-lucide-alert-triangle',
  'success': 'i-lucide-check-circle',
  'error': 'i-lucide-circle-x',
  'help': 'i-lucide-help-circle',
  'lock': 'i-lucide-lock',
  'view': 'i-lucide-eye',
  'ai': 'i-lucide-sparkles',
  // objects
  'rocket': 'i-lucide-rocket',
  'link': 'i-lucide-link',
  'file': 'i-lucide-file-text',
  'chart': 'i-lucide-chart-area',
  'calendar': 'i-lucide-calendar',
  'mail': 'i-lucide-mail',
  'play': 'i-lucide-play',
  'globe': 'i-lucide-globe',
  'plug': 'i-lucide-plug',
  'star': 'i-lucide-star',
  // brand
  'google': 'i-simple-icons-google',
  'github': 'i-simple-icons-github',
  'discord': 'i-simple-icons-discord',
} as const

export type UiIconName = keyof typeof UI_ICONS

/** Accepts a curated name (autocompleted) or a raw `i-*` string (escape hatch). */
export type UiIcon = UiIconName | (string & {})

/** Resolve a semantic name to its iconify id; pass raw `i-*` strings through. */
export function resolveUiIcon(icon: UiIcon | undefined): string | undefined {
  if (!icon)
    return undefined
  return (UI_ICONS as Record<string, string>)[icon] ?? icon
}
