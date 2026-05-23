/**
 * @unlighthouse/next — Next.js integration.
 *
 * First-iteration scaffold (Phase 15, issue #349):
 *   - `withUnlighthouse(nextConfig, options)` HOC wraps a user's
 *     `next.config.js` export. It attaches a webpack `done` hook on the
 *     client compiler so the scan runs once after a production build.
 *   - Companion `unlighthouse-next` bin (see `./cli.ts`) is shipped for
 *     users who don't want to touch their config — they run the CLI
 *     after `next build`.
 *
 * What is NOT in this iteration (deferred follow-ups):
 *   - Middleware that scans on preview deploys (Vercel / Netlify hooks)
 *   - PR-comment diff posting via GitHub API
 *   - Dev-mode HUD with live per-page Lighthouse scores
 *
 * Design notes:
 *   - Next has no first-class plugin API like Vite. The cleanest hook
 *     point is `webpack(config)` in `next.config.js`. We attach to the
 *     compiler's `done` hook, but Next runs both server + client
 *     compilers and emits `done` for each → we dedupe via a one-shot
 *     latch keyed off `isServer`.
 *   - `unlighthouse` is imported dynamically. The plugin doesn't bundle
 *     it — the host project's installed copy wins, matching how the
 *     Vite sibling behaves.
 *   - The scan is fire-and-forget by default. Next's build process is
 *     already long; we don't add to its critical path.
 *   - Honour `UNLIGHTHOUSE_SKIP=true` so users can disable the hook in
 *     specific CI matrices without editing config.
 */

const PLUGIN_NAME = 'unlighthouse:next'

export interface UnlighthouseNextOptions {
  /**
   * The site URL Unlighthouse should crawl. Defaults to
   * `http://localhost:3000` — i.e. the user is expected to have a
   * `next start` running. For now we don't auto-spawn one; that's a
   * follow-up (Phase 15 middleware bullet).
   */
  site?: string
  /**
   * Output directory (relative to the Next project root) for the
   * Unlighthouse report. Defaults to Unlighthouse's own default
   * (typically `.unlighthouse/<host>`).
   */
  outputPath?: string
  /**
   * Run the scan during `next build`? Defaults to `true`. The hook is
   * skipped automatically outside `NODE_ENV=production` regardless.
   */
  enableOnBuild?: boolean
  /**
   * Extra options forwarded to `createUnlighthouseHost({ userConfig })`.
   * Anything supported by Unlighthouse's `UserConfig` is passed through;
   * `site` / `outputPath` from above win over fields of the same name.
   */
  unlighthouse?: Record<string, unknown>
}

/**
 * Minimal shape of `NextConfig` we touch. We avoid importing Next's own
 * type to keep the package importable in environments where `next` isn't
 * installed (shape-only tests, type-checking on machines without Next).
 * Real Next consumers get the full type via their own import.
 */
export interface MinimalNextConfig {
  webpack?: (config: unknown, context: WebpackContext) => unknown
  [key: string]: unknown
}

export interface WebpackContext {
  isServer: boolean
  dev: boolean
  buildId?: string
  // Next passes many more fields; we don't depend on them.
  [key: string]: unknown
}

interface WebpackCompiler {
  hooks: {
    done: {
      tap: (name: string, fn: () => void) => void
    }
  }
}

/**
 * Wraps a Next.js config with an Unlighthouse post-build hook.
 *
 * @example
 * ```js
 * // next.config.js
 * const { withUnlighthouse } = require('@unlighthouse/next')
 * module.exports = withUnlighthouse({ reactStrictMode: true }, {
 *   site: 'http://localhost:3000',
 * })
 * ```
 */
export function withUnlighthouse<T extends MinimalNextConfig>(
  nextConfig: T = {} as T,
  options: UnlighthouseNextOptions = {},
): T & { webpack: NonNullable<MinimalNextConfig['webpack']> } {
  const { enableOnBuild = true } = options
  const userWebpack = nextConfig.webpack

  return {
    ...nextConfig,
    webpack(config: unknown, context: WebpackContext) {
      // Always preserve the user's existing webpack hook. We chain on
      // top — never replace.
      const result = userWebpack ? userWebpack(config, context) : config

      if (!enableOnBuild)
        return result
      // Only the client compiler — the server compiler also fires `done`
      // and we don't want to scan twice.
      if (context.isServer)
        return result
      // Skip during `next dev`. The scan should only run for real builds.
      if (context.dev)
        return result
      // CI escape hatch.
      if (process.env.UNLIGHTHOUSE_SKIP === 'true')
        return result
      // Only run for `NODE_ENV=production` (i.e. `next build`).
      if (process.env.NODE_ENV !== 'production')
        return result

      const compiler = config as WebpackCompiler
      if (!compiler?.hooks?.done?.tap) {
        // Defensive — if the shape we expect isn't there, don't crash
        // the build. Just no-op and warn once.

        console.warn(`[${PLUGIN_NAME}] could not attach to webpack done hook — skipping scan.`)
        return result
      }

      // Next's webpack(config) is called fresh for each compiler pass; a
      // module-level latch keyed by buildId is the simplest dedupe. If
      // there's no buildId we fall back to a single global latch.
      const latchKey = context.buildId ?? '__no_build_id__'
      if (scannedBuilds.has(latchKey))
        return result
      scannedBuilds.add(latchKey)

      compiler.hooks.done.tap(PLUGIN_NAME, () => {
        // Debounce: webpack can emit `done` more than once for the
        // same compiler (e.g. when reading from cache). Coalesce calls
        // arriving within the debounce window.
        scheduleScan(options)
      })

      return result
    },
  } as T & { webpack: NonNullable<MinimalNextConfig['webpack']> }
}

// Module-scoped state. Safe because Next spawns a fresh Node process per
// `next build` invocation — the latch resets between runs.
const scannedBuilds = new Set<string>()
let scanTimer: ReturnType<typeof setTimeout> | undefined
let scanRunning = false

function scheduleScan(options: UnlighthouseNextOptions): void {
  if (scanTimer)
    clearTimeout(scanTimer)
  // 250ms debounce is enough to absorb the burst of `done` events
  // webpack tends to fire during cache-hit builds.
  scanTimer = setTimeout(() => {
    scanTimer = undefined
    if (scanRunning)
      return
    scanRunning = true
    runScan(options)
      .catch((err) => {
        console.error(`[${PLUGIN_NAME}] background scan failed:`, err)
      })
      .finally(() => {
        scanRunning = false
      })
  }, 250)
}

/**
 * Resolve + run an Unlighthouse scan via the v1 host API. Exported so
 * the CLI entry (`./cli.ts`) can re-use it without duplicating the
 * dynamic-import contract.
 *
 * @internal
 */
export async function runScan(options: UnlighthouseNextOptions): Promise<void> {
  const {
    site = process.env.UNLIGHTHOUSE_SITE ?? 'http://localhost:3000',
    outputPath,
    unlighthouse: userOpts,
  } = options

  // Dynamic import of `unlighthouse` keeps it out of the plugin bundle so
  // the host project's installed copy wins. Variable specifier prevents
  // TypeScript from chasing the workspace source at type-check time and
  // dragging in unrelated transitive-dep type errors.
  interface UnlighthouseModule {
    createUnlighthouseHost: (opts: { userConfig: Record<string, unknown> }) => Promise<{
      start: () => Promise<{ scanId: string }>
    }>
  }
  const specifier = 'unlighthouse'
  const mod = (await import(specifier)) as UnlighthouseModule
  if (typeof mod.createUnlighthouseHost !== 'function')
    throw new TypeError('unlighthouse: createUnlighthouseHost not exported (need v1)')

  const userConfig: Record<string, unknown> = {
    ...(userOpts || {}),
    // Top-level wins over keys nested inside `unlighthouse: {...}`.
    site,
    ...(outputPath ? { outputPath } : {}),
  }

  const host = await mod.createUnlighthouseHost({ userConfig })
  const { scanId } = await host.start()
  // eslint-disable-next-line no-console
  console.log(`[${PLUGIN_NAME}] scan started: ${scanId} (site=${site})`)
}

export default withUnlighthouse
