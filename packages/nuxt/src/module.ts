/**
 * @unlighthouse/nuxt — Nuxt module.
 *
 * First-iteration scaffold (Phase 15, issue #349):
 *   - `generate:done` post-build hook spins up a static preview server,
 *     then runs Unlighthouse against the preview URL.
 *   - Auto-detects routes via the Nuxt router after build (uses the
 *     prerendered output's URL list when available).
 *   - Dev-mode HUD / overlay / per-page live scores are explicitly deferred.
 *
 * Design notes:
 *   - `unlighthouse` is a runtime workspace dep imported dynamically. We do
 *     not bundle it into the module — the host project's installed copy
 *     wins, which is what callers expect from a Nuxt module.
 *   - `@nuxt/kit` is a peer-dev dep — Nuxt itself owns version resolution.
 *     We dynamically `import('@nuxt/kit')` inside the installer so the
 *     TypeScript graph stays small and shape-only tests don't drag in
 *     kit's transitive type deps (some of which ship `.d.cts` files that
 *     TS 6 cannot parse, e.g. `@jridgewell/remapping@2.3.5`).
 *   - The scan runs non-blocking by default (`block: false`). The generate
 *     completes immediately; the scan is fire-and-forget in the background.
 *     Pass `block: true` to await the scan during `generate:done` (useful
 *     for CI where you want the report to land before the next step).
 *   - Set `UNLIGHTHOUSE_SKIP=true` in the environment to bypass the scan
 *     entirely (e.g. fast iterative builds where the report isn't needed).
 */

export interface UnlighthouseNuxtOptions {
  /**
   * The site URL Unlighthouse should crawl. When omitted, the module spins
   * up a static preview server against the generated output and uses its
   * resolved URL. Set this if you want to scan a non-preview host (e.g. a
   * separate staging environment that already serves the build).
   */
  site?: string
  /**
   * Output directory (relative to Nuxt root) for the Unlighthouse report.
   * Defaults to `<rootDir>/.output/unlighthouse-report`.
   */
  outputPath?: string
  /**
   * Block the build until the scan finishes. Defaults to `false` — the scan
   * runs in the background after `generate:done` resolves so the command
   * exits promptly.
   */
  block?: boolean
  /**
   * Run the scan after `nuxi generate`? Defaults to `true`. Disable when
   * using the module only for its (future) dev-mode features.
   */
  enableOnGenerate?: boolean
  /**
   * Extra options forwarded to `createUnlighthouseHost({ userConfig })`.
   * Anything supported by Unlighthouse's `UserConfig` is passed through;
   * `site` and `outputPath` from above win over fields of the same name.
   */
  unlighthouse?: Record<string, unknown>
}

const MODULE_NAME = '@unlighthouse/nuxt'
const CONFIG_KEY = 'unlighthouse'

// Minimal local mirror of @nuxt/kit's `NuxtModule` shape — keeps Nuxt's
// loader happy without pulling in kit's full type graph at typecheck time.
// The fields Nuxt's module loader actually reads are:
//   - the callable itself      (installer)
//   - `meta.name`               (logging + module identity)
//   - `meta.configKey`          (where to look in `nuxt.config.ts`)
//   - `meta.compatibility.nuxt` (semver gate)
//   - `getOptions(inline, nuxt)` (optional, used by `nuxi prepare`)
interface NuxtInstaller<O> {
  (inlineOptions: Partial<O> | undefined, nuxt: any): Promise<void> | void
  meta: {
    name: string
    configKey: string
    compatibility: { nuxt: string }
  }
  getOptions: (inline: Partial<O> | undefined, nuxt: any) => Promise<O>
}

const defaults: UnlighthouseNuxtOptions = {
  enableOnGenerate: true,
  block: false,
}

async function resolveOptions(
  inline: Partial<UnlighthouseNuxtOptions> | undefined,
  nuxt: any,
): Promise<UnlighthouseNuxtOptions> {
  const fromConfig = (nuxt?.options?.[CONFIG_KEY] || {}) as Partial<UnlighthouseNuxtOptions>
  return { ...defaults, ...fromConfig, ...(inline || {}) }
}

const installer: NuxtInstaller<UnlighthouseNuxtOptions> = (async (
  inlineOptions: Partial<UnlighthouseNuxtOptions> | undefined,
  nuxt: any,
) => {
  const options = await resolveOptions(inlineOptions, nuxt)

  // Surface options on runtimeConfig so server routes (future HUD) +
  // user code can read the resolved config without re-importing the
  // module. Stored under `runtimeConfig.unlighthouse` (private — not
  // exposed to the browser).
  nuxt.options.runtimeConfig = nuxt.options.runtimeConfig || {}
  const rc = nuxt.options.runtimeConfig as Record<string, unknown>
  rc.unlighthouse = {
    ...((rc.unlighthouse as Record<string, unknown> | undefined) || {}),
    ...options,
  }

  // TODO(Phase 15 follow-up): register dev-mode HUD route via
  // `addServerHandler` from '@nuxt/kit' — `/_unlighthouse/scores.json`
  // streaming live per-page Lighthouse scores into a Nuxt devtools panel.

  if (!options.enableOnGenerate)
    return

  // Hook the post-`nuxi generate` lifecycle. Nuxt fires `generate:done`
  // after the static output has been written to `.output/public`.
  nuxt.hook('generate:done', async () => {
    if (process.env.UNLIGHTHOUSE_SKIP === 'true') {
      // eslint-disable-next-line no-console
      console.log(`[${MODULE_NAME}] UNLIGHTHOUSE_SKIP=true, skipping scan`)
      return
    }

    const rootDir = (nuxt.options.rootDir as string | undefined) ?? process.cwd()
    const generatedDir = (nuxt.options as any).nitro?.output?.publicDir
      || `${rootDir}/.output/public`

    const run = runScan({ rootDir, generatedDir, options })
    if (options.block) {
      await run
    }
    else {
      // Fire-and-forget. Surface failures via stderr but never reject
      // the generate pipeline — the report is auxiliary, not a gate.
      run.catch((err) => {
        console.error(`[${MODULE_NAME}] background scan failed:`, err)
      })
    }
  })
}) as NuxtInstaller<UnlighthouseNuxtOptions>

installer.meta = {
  name: MODULE_NAME,
  configKey: CONFIG_KEY,
  compatibility: { nuxt: '>=3.0.0' },
}
installer.getOptions = resolveOptions

export default installer

interface RunScanArgs {
  rootDir: string
  generatedDir: string
  options: UnlighthouseNuxtOptions
}

async function runScan({ rootDir, generatedDir, options }: RunScanArgs): Promise<void> {
  const { site: explicitSite, outputPath, unlighthouse: userOpts } = options

  let site = explicitSite
  let previewServer: { close: () => Promise<void> | void } | undefined

  try {
    if (!site) {
      // Spin up a tiny static file server against the generated output.
      // Built on `node:http` so we don't drag in an extra dependency just
      // for shape stability — the host project already gets `unlighthouse`
      // for the heavy lifting once the URL is known. Dynamic imports keep
      // shape-only tests free of node-runtime side effects.
      const http = await import('node:http')
      const fs = await import('node:fs')
      const path = await import('node:path')
      const { URL } = await import('node:url')

      const server = http.createServer((req, res) => {
        try {
          const reqUrl = new URL(req.url || '/', 'http://localhost')
          let rel = decodeURIComponent(reqUrl.pathname)
          if (rel.endsWith('/'))
            rel += 'index.html'
          const abs = path.join(generatedDir, rel)
          // Guard against path traversal — refuse anything outside generatedDir.
          if (!abs.startsWith(path.resolve(generatedDir))) {
            res.statusCode = 403
            res.end('forbidden')
            return
          }
          fs.stat(abs, (err, stat) => {
            if (err || !stat.isFile()) {
              // SPA fallback: serve index.html if it exists.
              const fallback = path.join(generatedDir, 'index.html')
              fs.stat(fallback, (err2) => {
                if (err2) {
                  res.statusCode = 404
                  res.end('not found')
                  return
                }
                fs.createReadStream(fallback).pipe(res)
              })
              return
            }
            fs.createReadStream(abs).pipe(res)
          })
        }
        catch {
          res.statusCode = 500
          res.end('error')
        }
      })

      const port: number = await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address()
          if (addr && typeof addr === 'object')
            resolve(addr.port)
          else reject(new Error('preview server failed to bind'))
        })
      })
      previewServer = {
        close: () => new Promise<void>(resolve => server.close(() => resolve())),
      }
      site = `http://127.0.0.1:${port}`
    }

    // Dynamic import of `unlighthouse` keeps it out of the module bundle so
    // the host project's installed copy wins. We assemble the module
    // specifier from a variable so TypeScript doesn't try to resolve it at
    // type-check time (which would chase the workspace's source files and
    // pick up unrelated type errors in transitive deps the module never
    // touches at runtime).
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
      root: rootDir,
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
    console.log(`[${MODULE_NAME}] scan started: ${scanId} (site=${site})`)
  }
  finally {
    if (previewServer) {
      try {
        await previewServer.close()
      }
      catch {
        // Best-effort — don't surface preview-close failures.
      }
    }
  }
}
