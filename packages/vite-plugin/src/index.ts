/**
 * @unlighthouse/vite — framework-agnostic Vite plugin.
 *
 * First-iteration scaffold (Phase 15, issue #349):
 *   - `closeBundle` post-build hook spins up a Vite preview server, then
 *     runs Unlighthouse against the preview URL.
 *   - Dev-mode HUD / overlay / per-page live scores are explicitly deferred.
 *
 * Design notes:
 *   - `unlighthouse` is a runtime workspace dep imported dynamically. We do
 *     not bundle it into the plugin — the host project's installed copy
 *     wins, which is what callers expect from a plugin.
 *   - `vite` is a peer dep. The plugin imports `preview` lazily so that
 *     consumers using build-only Vite don't pay the import cost up front.
 *   - The scan runs non-blocking by default (`block: false`). The build
 *     completes immediately; the scan is fire-and-forget in the background.
 *     Pass `block: true` to await the scan during `closeBundle` (useful for
 *     CI where you want the report to land before the next step).
 */

import type { Plugin, ResolvedConfig } from 'vite'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { logOperationalError } from '@unlighthouse/contracts/logging'

export interface UnlighthouseViteOptions {
  /**
   * The site URL Unlighthouse should crawl. When omitted, the plugin
   * spins up a Vite preview server against the build output and uses its
   * resolved URL. Set this if you want to scan a non-preview host (e.g.
   * a separate staging environment that already serves the build).
   */
  site?: string
  /**
   * Output directory (relative to Vite root) for the Unlighthouse report.
   * Defaults to `<vite.build.outDir>/unlighthouse-report`.
   */
  outputPath?: string
  /**
   * Block the build until the scan finishes. Defaults to `false` — the
   * scan runs in the background after `closeBundle` resolves so the build
   * command exits promptly.
   */
  block?: boolean
  /**
   * Run the scan during `vite build`? Defaults to `true`. Disable when
   * using the plugin only for its (future) dev-mode features.
   */
  enableOnBuild?: boolean
  /**
   * Extra options forwarded to `createUnlighthouseHost({ userConfig })`.
   * Anything supported by Unlighthouse's `UserConfig` is passed through;
   * `site` and `outputPath` from above win over fields of the same name.
   */
  unlighthouse?: Record<string, unknown>
}

const PLUGIN_NAME = 'unlighthouse:vite'

export function unlighthouseVite(options: UnlighthouseViteOptions = {}): Plugin {
  const { enableOnBuild = true, block = false } = options
  let resolvedConfig: ResolvedConfig | undefined

  return {
    name: PLUGIN_NAME,
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config
    },
    async closeBundle() {
      if (!enableOnBuild)
        return
      // Vite calls `closeBundle` for both library + app builds; we only
      // care about app builds with an actual outDir. SSR builds also hit
      // this path — skip them since serving + scanning SSR output needs
      // a real Node server, not Vite's static preview.
      if (resolvedConfig?.build?.ssr)
        return

      const run = runScan(resolvedConfig, options)
      if (block) {
        await run
      }
      else {
        // Fire-and-forget. Surface failures via stderr but never reject
        // the build pipeline — the report is auxiliary, not a gate.
        run.catch((err) => {
          logOperationalError('vite.background_scan_failed', err, {}, console)
        })
      }
    },
  }
}

async function runScan(
  resolvedConfig: ResolvedConfig | undefined,
  options: UnlighthouseViteOptions,
): Promise<void> {
  const { site: explicitSite, outputPath, unlighthouse: userOpts } = options

  let site = explicitSite
  let previewServer: { close: () => Promise<void> | void, resolvedUrls?: { local: string[], network: string[] } } | undefined

  try {
    if (!site) {
      // Defer the vite import until we actually need it so the plugin
      // package can be imported in environments where vite isn't fully
      // installed (e.g. shape-only tests).
      const { preview } = await import('vite')
      previewServer = await preview({
        // Re-use root + build config from the host. Pass undefined when
        // we have no resolvedConfig (defensive — closeBundle always fires
        // after configResolved in practice).
        root: resolvedConfig?.root,
        build: { outDir: resolvedConfig?.build?.outDir },
        preview: { open: false },
      }) as typeof previewServer
      const url = previewServer?.resolvedUrls?.local?.[0]
      if (!url)
        throw new UnlighthouseError({
          code: 'INFRA_RETRYABLE',
          message: 'vite preview server did not resolve a local URL',
        })
      site = url
    }

    // Dynamic import of `unlighthouse` keeps it out of the plugin bundle
    // so the host project's installed copy wins. We assemble the module
    // specifier from a variable so TypeScript doesn't try to resolve it
    // at type-check time (which would chase the workspace's source files
    // and pick up unrelated type errors in transitive deps the plugin
    // never touches at runtime).
    interface UnlighthouseModule {
      createUnlighthouseHost: (opts: { userConfig: Record<string, unknown> }) => Promise<{
        start: () => Promise<{ scanId: string }>
      }>
    }
    const specifier = 'unlighthouse'
    const mod = (await import(specifier)) as UnlighthouseModule
    if (typeof mod.createUnlighthouseHost !== 'function')
      throw new UnlighthouseError({
        code: 'CONFIG_INVALID',
        message: 'unlighthouse: createUnlighthouseHost not exported (need v1)',
      })

    const userConfig: Record<string, unknown> = {
      site,
      ...(outputPath ? { outputPath } : {}),
      ...(userOpts || {}),
    }
    // Caller-provided `site`/`outputPath` in `userOpts` should not override
    // explicit top-level options. Top-level wins (defu-style precedence).
    userConfig.site = site
    if (outputPath)
      userConfig.outputPath = outputPath

    const host = await mod.createUnlighthouseHost({ userConfig })
    const { scanId } = await host.start()
    // eslint-disable-next-line no-console
    console.log(`[${PLUGIN_NAME}] scan started: ${scanId} (site=${site})`)
  }
  finally {
    if (previewServer) {
      try {
        await previewServer.close()
      }
      catch (_err) {
        // Best-effort cleanup after the scan attempt; the scan result is already settled.
      }
    }
  }
}

export default unlighthouseVite
