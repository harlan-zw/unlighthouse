// D-039: `seeds/route-definitions` — a SeedSource that scans a framework's
// page files (Nuxt / Next file conventions) and returns both:
//   1. `seeds()` — concrete URLs for every *static* page (dynamic routes have no
//      enumerable value, so they are template-only).
//   2. `matcher(url)` — resolves any URL (including dynamic + crawler-discovered
//      ones) to its route template's `routeName`, feeding the existing
//      `routeName` column at ingest (see core/scan/route-audit.ts).
//
// Node-only: it reads the filesystem. It therefore lives behind its own subpath
// export (`@unlighthouse/core/seeds/route-definitions`) and is NEVER re-exported
// from the `./seeds` barrel, so Worker bundles never pull `node:fs` through it.

import type { Logger } from '@unlighthouse/contracts'
import type { Seed, SeedSource } from '@unlighthouse/contracts/ports'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'

export type RouteDefinitionsFramework = 'nuxt' | 'next'

export interface RouteDefinitionsOptions {
  /** Absolute path to the framework's page directory to scan. */
  pagesDir: string
  /** File-convention framework. Defaults to `'nuxt'`. */
  framework?: RouteDefinitionsFramework
  /** Page file extensions (no leading dot). Defaults per framework. */
  extensions?: string[]
  /**
   * Origin the static seeds are emitted against, e.g. `https://example.com`.
   * When absent, seeds are emitted as root-relative paths (the crawler/discovery
   * layer resolves them against the configured site, mirroring `manualSeeds`).
   */
  site?: string
  /** Tagged logger from the host; absent = silent. */
  logger?: Logger
}

/** One parsed page route: its URL-path template + Nuxt-style grouping name. */
export interface RouteDefinition {
  /** URL path template, e.g. `/users/:id` (`/` for the index route). */
  path: string
  /** Template grouping key, e.g. `users-id` (`index` for the root). */
  routeName: string
  /** True when the template contains a dynamic or catch-all segment. */
  dynamic: boolean
  /** Compiled matcher, anchored, trailing-slash tolerant. */
  regex: RegExp
  /** Source page file (absolute), for diagnostics. */
  file: string
}

export interface RouteDefinitionsSeedSource extends SeedSource {
  /**
   * Resolve a URL (absolute or path-only) to its route template's `routeName`.
   * Returns `null` when no template matches. Most-specific template wins
   * (static before dynamic; catch-all last).
   */
  matcher: (url: string) => string | null
  /** The parsed route definitions, sorted most-specific first. */
  definitions: RouteDefinition[]
}

const DEFAULT_EXTENSIONS: Record<RouteDefinitionsFramework, string[]> = {
  nuxt: ['vue', 'js', 'jsx', 'ts', 'tsx', 'md'],
  next: ['js', 'jsx', 'ts', 'tsx'],
}

// Next app-router files that are not routable pages.
const NEXT_APP_NON_PAGE = new Set([
  'layout',
  'loading',
  'error',
  'not-found',
  'template',
  'default',
  'route',
  'global-error',
])

interface SegInfo {
  /** Regex fragment matching this segment (without the leading slash). */
  regex: string
  /** Name fragment contributed to `routeName`. */
  name: string
  dynamic: boolean
  catchAll: boolean
  /** Segments that contribute nothing (index leaves, route groups). */
  skip: boolean
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parse one path segment under the shared bracket conventions (Nuxt + Next both
 * use `[id]`, `[...slug]`, `[[id]]` / `[[...slug]]`). Next route groups `(x)`
 * contribute nothing to the URL or the name.
 */
function parseSegment(seg: string): SegInfo {
  // Route group `(group)` — path-transparent.
  if (/^\(.+\)$/.test(seg))
    return { regex: '', name: '', dynamic: false, catchAll: false, skip: true }

  // Optional catch-all `[[...slug]]`.
  let m = seg.match(/^\[\[\.\.\.(.+)\]\]$/)
  if (m)
    return { regex: '(?:/.*)?', name: m[1]!, dynamic: true, catchAll: true, skip: false }

  // Catch-all `[...slug]`.
  m = seg.match(/^\[\.\.\.(.+)\]$/)
  if (m)
    return { regex: '(?:/.*)?', name: m[1]!, dynamic: true, catchAll: true, skip: false }

  // Optional dynamic `[[id]]` — treated as present-or-absent by making the
  // segment (and its slash) optional.
  m = seg.match(/^\[\[(.+)\]\]$/)
  if (m)
    return { regex: '(?:/[^/]+)?', name: m[1]!, dynamic: true, catchAll: false, skip: false }

  // Dynamic `[id]`.
  m = seg.match(/^\[(.+)\]$/)
  if (m)
    return { regex: `/[^/]+`, name: m[1]!, dynamic: true, catchAll: false, skip: false }

  // Static.
  return { regex: `/${escapeRegex(seg)}`, name: seg, dynamic: false, catchAll: false, skip: false }
}

function stripExtension(name: string, extensions: string[]): { base: string, ext: string } | null {
  for (const ext of extensions) {
    if (name.endsWith(`.${ext}`))
      return { base: name.slice(0, -(ext.length + 1)), ext }
  }
  return null
}

/**
 * Convert a page file's segments (directory parts + filename base) into a
 * `RouteDefinition`, or `null` when the file is not a routable page.
 */
function definitionFor(
  segments: string[],
  base: string,
  framework: RouteDefinitionsFramework,
  file: string,
): RouteDefinition | null {
  const routeSegments = [...segments]

  if (framework === 'next') {
    // Skip private files / api routes in the pages router.
    if (base.startsWith('_') || routeSegments[0] === 'api')
      return null
    if (base === 'page') {
      // App-router leaf — the directory IS the route.
    }
    else if (NEXT_APP_NON_PAGE.has(base)) {
      return null
    }
    else if (base !== 'index') {
      routeSegments.push(base)
    }
  }
  else {
    // Nuxt: `index` is the folder root; every other basename is a segment.
    if (base !== 'index')
      routeSegments.push(base)
  }

  const parsed = routeSegments.map(parseSegment).filter(s => !s.skip)

  let regexBody = ''
  let dynamic = false
  for (const seg of parsed) {
    regexBody += seg.regex
    if (seg.dynamic)
      dynamic = true
    if (seg.catchAll)
      break
  }
  const regex = new RegExp(`^${regexBody || '/'}/?$`)

  const name = parsed.map(s => s.name).filter(Boolean).join('-') || 'index'

  // Path template (human-readable; not used for matching): `:param` / `*` forms.
  const pathTemplate = `/${routeSegments
    .map((seg) => {
      const info = parseSegment(seg)
      if (info.skip)
        return ''
      if (info.catchAll)
        return `:${info.name}(.*)*`
      if (info.dynamic)
        return `:${info.name}`
      return seg
    })
    .filter(Boolean)
    .join('/')}`.replace(/\/{2,}/g, '/') || '/'

  return {
    path: pathTemplate === '' ? '/' : pathTemplate,
    routeName: name,
    dynamic,
    regex,
    file,
  }
}

/** Recursively collect page files under `dir`, returning path segments + base. */
function collectPageFiles(
  dir: string,
  extensions: string[],
  segments: string[],
  out: Array<{ segments: string[], base: string, file: string }>,
): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip framework-private dirs that never contain routable pages.
      if (entry.name === 'node_modules' || entry.name.startsWith('.'))
        continue
      collectPageFiles(abs, extensions, [...segments, entry.name], out)
      continue
    }
    if (!entry.isFile())
      continue
    const stripped = stripExtension(entry.name, extensions)
    if (!stripped)
      continue
    out.push({ segments, base: stripped.base, file: abs })
  }
}

/**
 * Specificity score for match ordering — lower wins. Static routes (0 dynamic
 * segments) beat dynamic ones; catch-alls sort last; among equal dynamism the
 * route with more path segments (more specific) is preferred.
 */
function specificity(def: RouteDefinition): [number, number] {
  const catchAll = /\(\?:\/\.\*\)\?/.test(def.regex.source) ? 1 : 0
  const dynamicSegments = (def.regex.source.match(/\[\^\/\]\+/g) ?? []).length
  const segmentCount = (def.path.match(/[^/]+/g) ?? []).length
  return [catchAll * 100 + dynamicSegments, -segmentCount]
}

function normalisePathname(url: string): string {
  try {
    return new URL(url, 'http://route-definitions.local').pathname
  }
  catch {
    // Already a path — use as-is, stripping any query/hash.
    return url.split(/[?#]/)[0]!
  }
}

/**
 * Scan `pagesDir` for framework page files and build a `RouteDefinitionsSeedSource`.
 *
 * A missing/unreadable pages directory is an expected, recoverable condition
 * (user misconfigured the path): it is logged at warn level and the source
 * yields nothing — the scan falls back to other seed sources (sitemap, manual),
 * mirroring `sitemapSeeds`. Unexpected fs errors propagate.
 */
export function routeDefinitionSeeds(opts: RouteDefinitionsOptions): RouteDefinitionsSeedSource {
  const framework = opts.framework ?? 'nuxt'
  const extensions = opts.extensions ?? DEFAULT_EXTENSIONS[framework]

  let definitions: RouteDefinition[] = []
  if (!existsSync(opts.pagesDir)) {
    logOperationalWarn(
      'seeds.route_definitions_scan_failed',
      new Error(`Pages directory not found: ${opts.pagesDir}`),
      { pagesDir: opts.pagesDir, framework },
      opts.logger,
    )
  }
  else {
    const files: Array<{ segments: string[], base: string, file: string }> = []
    collectPageFiles(opts.pagesDir, extensions, [], files)
    const byName = new Map<string, RouteDefinition>()
    for (const { segments, base, file } of files) {
      const def = definitionFor(segments, base, framework, file)
      if (def)
        byName.set(def.routeName, def)
    }
    definitions = [...byName.values()].sort((a, b) => {
      const [as, at] = specificity(a)
      const [bs, bt] = specificity(b)
      return as - bs || at - bt
    })
  }

  function matcher(url: string): string | null {
    const pathname = normalisePathname(url)
    for (const def of definitions) {
      if (def.regex.test(pathname))
        return def.routeName
    }
    return null
  }

  async function* seeds(): AsyncIterable<Seed> {
    for (const def of definitions) {
      if (def.dynamic)
        continue
      const url = opts.site ? new URL(def.path, opts.site).toString() : def.path
      yield { url, source: 'route-def', routeName: def.routeName }
    }
  }

  return { seeds, matcher, definitions }
}
