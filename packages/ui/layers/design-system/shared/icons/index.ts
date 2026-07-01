/**
 * Public icon API for the design system.
 *
 * - `ACTIVE_ICON_SET` — the set the whole app renders. Change this one line and
 *   restart dev to swap lucide ↔ carbon ↔ solar ↔ hugeicons everywhere (UiIcon,
 *   UiButton, and Nuxt UI internals via app.config). Preview sets first in the
 *   brand-kit `/icons` playground.
 * - `resolveUiIcon(role)` — role → iconify id for the active set, with fallback.
 * - Raw `i-*` ids pass straight through, so adoption can be incremental.
 *
 * `iconBundleList()` is intentionally derived from the active set so @nuxt/icon's
 * client bundle ships the icons we render, without scanning all candidate sets.
 */
import type { IconRole, IconSet, RoleMap } from './registry'
import { ICON_ALIASES, ICON_ROLES, ICON_SETS } from './registry'

export type { IconRole, IconSet, RoleMap } from './registry'
export { ICON_ALIASES, ICON_ROLES, ICON_SETS } from './registry'

/**
 * The active icon set for the whole app. Change this one line and restart dev to
 * swap lucide ↔ carbon ↔ solar ↔ hugeicons everywhere (UiIcon, UiButton, raw Nuxt
 * UI via @nuxt/icon aliases, and app.config). Compare sets first in brand-kit /icons.
 * (A runtimeConfig-driven switch can come later alongside the tree-shaking rework.)
 */
export const ACTIVE_ICON_SET: IconSet = 'lucide'

/** A curated role name (autocompleted) or a raw `i-*` id (escape hatch). */
export type UiIcon = IconRole | (string & {})

function idFor(role: RoleMap, set: IconSet): string | undefined {
  if (role.fixed)
    return role.fixed
  // active set first, then fall back through the remaining sets in priority order
  const order = [set, ...ICON_SETS.filter(s => s !== set)]
  for (const s of order) {
    const bare = role[s]
    if (bare)
      return `i-${s}-${bare}`
  }
  return undefined
}

/** Resolve a semantic role to its iconify id for `set`; pass raw `i-*` strings through. */
export function resolveUiIcon(icon: UiIcon | undefined, set: IconSet = ACTIVE_ICON_SET): string | undefined {
  if (!icon)
    return undefined
  if (icon.startsWith('i-'))
    return icon
  // resolve aliases (synonyms) to their canonical role first
  const name = (ICON_ALIASES as Record<string, IconRole>)[icon] ?? icon
  const role = (ICON_ROLES as Record<string, RoleMap>)[name]
  if (!role)
    return icon // unknown name: pass through unchanged
  return idFor(role, set)
}

/** Map of every role → resolved id for `set`. Used to generate app.config ui.icons. */
export function iconMapFor(set: IconSet = ACTIVE_ICON_SET): Record<IconRole, string> {
  const out = {} as Record<IconRole, string>
  for (const role of Object.keys(ICON_ROLES) as IconRole[])
    out[role] = idFor(ICON_ROLES[role] as RoleMap, set)!
  return out
}

// Collections that contain a hyphen, so `i-<collection>-<name>` can't be split naively.
const HYPHEN_COLLECTIONS = ['simple-icons', 'svg-spinners', 'circle-flags', 'vscode-icons']

/** `i-lucide-arrow-right` → `lucide:arrow-right` (handles multi-hyphen collections). */
function toPrefixName(id: string): string {
  const body = id.replace(/^i-/, '')
  const coll = HYPHEN_COLLECTIONS.find(c => body.startsWith(`${c}-`))
  return coll ? `${coll}:${body.slice(coll.length + 1)}` : body.replace('-', ':')
}

// Nuxt UI injects a few raw Lucide defaults that do not map through our role aliases.
// Keep them in the client bundle so generated SPA reports do not depend on Iconify API.
const NUXT_UI_ICON_BUNDLE = [
  'lucide:copy-check',
  'lucide:file',
  'lucide:folder-open',
  'lucide:panel-left-close',
  'lucide:panel-left-open',
  'lucide:rotate-ccw',
] as const

/**
 * The exact `prefix:name` ids for every role under `set` — feed to @nuxt/icon's
 * `clientBundle.icons` so the build ships only the active set's resolved icons
 * (plus the fixed brand/loading marks), never all four candidate sets.
 */
export function iconBundleList(set: IconSet = ACTIVE_ICON_SET): string[] {
  return [...new Set([
    ...Object.values(iconMapFor(set)).map(toPrefixName),
    ...NUXT_UI_ICON_BUNDLE,
  ])]
}

/**
 * Role + synonym-alias name → `prefix:name` id, for @nuxt/icon's `aliases` config.
 * MUST be `prefix:name` (not `i-...`): @nuxt/icon uses an alias's value as the resolved
 * name verbatim and re-prefixes `i-`, so an `i-` value becomes a broken `i-i-...`.
 */
export function iconAliasMap(set: IconSet = ACTIVE_ICON_SET): Record<string, string> {
  const resolved = iconMapFor(set)
  const out: Record<string, string> = {}
  for (const [role, id] of Object.entries(resolved))
    out[role] = toPrefixName(id)
  for (const [alias, role] of Object.entries(ICON_ALIASES))
    out[alias] = toPrefixName(resolved[role as IconRole])
  return out
}
