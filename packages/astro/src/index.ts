/**
 * @unlighthouse/astro — Astro integration.
 *
 * First-iteration scaffold (Phase 15, issue #349):
 *   - `astro:build:done` hook spins up a tiny static-file HTTP server
 *     against Astro's build output `dir`, then runs Unlighthouse against
 *     the preview URL, seeded with the `routes` array Astro provides.
 *   - Content-collection-aware seed extraction is explicitly deferred —
 *     see the TODO further down. The first cut just trusts what Astro
 *     hands us in `routes` / `pages`.
 *
 * Design notes:
 *   - `unlighthouse` is a runtime workspace dep imported dynamically. We
 *     do not bundle it — the host project's installed copy wins.
 *   - `astro` is a peer dep; we don't import its types at runtime so the
 *     plugin module is loadable in environments where astro isn't fully
 *     resolved (e.g. shape-only tests). The `AstroIntegration` interface
 *     is mirrored locally with the minimum surface we depend on.
 *   - The scan runs non-blocking by default (`block: false`). The build
 *     completes immediately; the scan is fire-and-forget. Pass
 *     `block: true` to await the scan during `astro:build:done` (useful
 *     for CI where you want the report to land before the next step).
 *   - Honours `UNLIGHTHOUSE_SKIP=true` as a global opt-out so CI matrices
 *     can disable the scan without editing the host config.
 */

import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The subset of `AstroIntegration` we actually depend on. Mirroring it
 * locally keeps the plugin source loadable without an installed `astro`
 * peer — matching what TS does for any peer-typed integration.
 */
export interface UnlighthouseAstroIntegration {
  name: string
  hooks: {
    'astro:build:done': (ctx: AstroBuildDoneContext) => void | Promise<void>
  }
}

/**
 * The shape of the argument Astro passes to `astro:build:done`. We pick
 * out the fields we use; Astro's full type also carries a logger etc.
 */
export interface AstroBuildDoneContext {
  /** Absolute URL pointing at the build output directory. */
  dir: URL
  /** Routes Astro emitted, each with a `pathname` we can scan. */
  routes: ReadonlyArray<{ pathname?: string | undefined } & Record<string, unknown>>
  /** Optional pages array (older API). Same `pathname` shape. */
  pages?: ReadonlyArray<{ pathname: string }>
}

export interface UnlighthouseAstroOptions {
  /**
   * The site URL Unlighthouse should crawl. When omitted, the integration
   * spins up a tiny static HTTP server against the build output and uses
   * its URL. Set this if you want to scan a non-preview host (e.g. a
   * separate staging environment that already serves the build).
   */
  site?: string
  /**
   * Output directory for the Unlighthouse report. Defaults to
   * `<dist>/unlighthouse-report`.
   */
  outputPath?: string
  /**
   * Block the build until the scan finishes. Defaults to `false` — the
   * scan runs in the background after `astro:build:done` resolves so the
   * build command exits promptly.
   */
  block?: boolean
  /**
   * Run the scan during `astro build`? Defaults to `true`. Disable when
   * using the integration only for its (future) dev-mode features.
   */
  enableOnBuild?: boolean
  /**
   * Extra options forwarded to `createUnlighthouseHost({ userConfig })`.
   * Anything supported by Unlighthouse's `UserConfig` is passed through;
   * `site`, `outputPath`, and seeded URLs derived from Astro routes win
   * over fields of the same name.
   */
  unlighthouse?: Record<string, unknown>
}

const INTEGRATION_NAME = '@unlighthouse/astro'

export function unlighthouseAstro(
  options: UnlighthouseAstroOptions = {},
): UnlighthouseAstroIntegration {
  const { enableOnBuild = true, block = false } = options

  return {
    name: INTEGRATION_NAME,
    hooks: {
      'astro:build:done': async (ctx) => {
        if (!enableOnBuild)
          return

        // Global opt-out for CI matrices. Documented in the README.
        if (process.env.UNLIGHTHOUSE_SKIP === 'true')
          return

        const run = runScan(ctx, options)
        if (block) {
          await run
        }
        else {
          // Fire-and-forget. Surface failures via stderr but never reject
          // the build pipeline — the report is auxiliary, not a gate.
          run.catch((err) => {
            console.error(`[${INTEGRATION_NAME}] background scan failed:`, err)
          })
        }
      },
    },
  }
}

async function runScan(
  ctx: AstroBuildDoneContext,
  options: UnlighthouseAstroOptions,
): Promise<void> {
  const { site: explicitSite, outputPath, unlighthouse: userOpts } = options

  let site = explicitSite
  let server: { close: () => Promise<void> } | undefined

  try {
    if (!site) {
      const dirPath = fileURLToPath(ctx.dir)
      server = await startStaticServer(dirPath)
      site = (server as { url: string } & typeof server).url
    }

    // TODO(content-collections): Astro content collections live behind
    // `astro:content`, a runtime virtual module. Build-time seed
    // extraction needs us to either (a) load the host's bundled
    // collections at this hook (the `dir` we're handed contains the
    // compiled output, not the source) or (b) hook earlier
    // (`astro:config:setup` → `astro:build:start`) and read collection
    // entry slugs via the Astro Content Layer API. Both paths are
    // non-trivial — first cut just uses the routes Astro hands us.
    const seededUrls = extractRouteUrls(ctx, site)

    // Dynamic import of `unlighthouse` keeps it out of the integration
    // bundle so the host project's installed copy wins. Specifier is
    // assembled from a variable so TypeScript doesn't chase the workspace
    // source files at type-check time.
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
    }
    // Caller-provided `site`/`outputPath`/`urls` in `userOpts` should not
    // override what we resolved from the build context. Top-level wins.
    userConfig.site = site
    if (outputPath)
      userConfig.outputPath = outputPath
    if (seededUrls.length > 0)
      userConfig.urls = seededUrls

    const host = await mod.createUnlighthouseHost({ userConfig })
    const { scanId } = await host.start()
    // eslint-disable-next-line no-console
    console.log(`[${INTEGRATION_NAME}] scan started: ${scanId} (site=${site}, routes=${seededUrls.length})`)
  }
  finally {
    if (server) {
      try {
        await server.close()
      }
      catch {
        // Best-effort — don't surface preview-close failures.
      }
    }
  }
}

/**
 * Walk Astro's `routes` (and legacy `pages`) into absolute URLs against
 * the resolved `site`. Dedupes; drops routes without a pathname
 * (dynamic routes Astro didn't pre-render).
 */
function extractRouteUrls(ctx: AstroBuildDoneContext, site: string): string[] {
  const base = site.endsWith('/') ? site.slice(0, -1) : site
  const seen = new Set<string>()
  const push = (pathname: string | undefined): void => {
    if (!pathname)
      return
    const path = pathname.startsWith('/') ? pathname : `/${pathname}`
    seen.add(`${base}${path}`)
  }
  for (const route of ctx.routes || [])
    push(route.pathname)
  for (const page of ctx.pages || [])
    push(page.pathname)
  return [...seen]
}

/**
 * Tiny static-file server backing the build output. We avoid taking on
 * `serve-handler` or similar deps — the integration only needs basic
 * file serving for Unlighthouse to crawl the report.
 *
 * Note: this is intentionally minimal. SPAs / 404 fallbacks aren't
 * handled here; if the host needs richer preview behaviour they should
 * pass an explicit `site` URL pointing at their own preview server.
 */
async function startStaticServer(root: string): Promise<{ url: string, close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    try {
      const reqUrl = req.url || '/'
      const rawPath = reqUrl.split('?')[0] || '/'
      const decoded = decodeURIComponent(rawPath)
      const safePath = normalize(decoded).replace(/^([./\\])+/, '')
      let filePath = join(root, safePath)

      let stat
      try {
        stat = statSync(filePath)
      }
      catch {
        res.statusCode = 404
        res.end('Not Found')
        return
      }

      if (stat.isDirectory()) {
        filePath = join(filePath, 'index.html')
        try {
          stat = statSync(filePath)
        }
        catch {
          res.statusCode = 404
          res.end('Not Found')
          return
        }
      }

      res.statusCode = 200
      res.setHeader('content-type', mimeFor(filePath))
      res.setHeader('content-length', String(stat.size))
      createReadStream(filePath).pipe(res)
    }
    catch (err) {
      res.statusCode = 500
      res.end(`Internal error: ${(err as Error).message}`)
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('static preview server did not bind to a port')

  const url = `http://127.0.0.1:${address.port}`
  const close = (): Promise<void> => new Promise((resolve) => {
    server.close(() => resolve())
  })
  return { url, close }
}

function mimeFor(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'html': return 'text/html; charset=utf-8'
    case 'js': case 'mjs': return 'text/javascript; charset=utf-8'
    case 'css': return 'text/css; charset=utf-8'
    case 'json': return 'application/json; charset=utf-8'
    case 'svg': return 'image/svg+xml'
    case 'png': return 'image/png'
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    case 'ico': return 'image/x-icon'
    case 'woff': return 'font/woff'
    case 'woff2': return 'font/woff2'
    case 'ttf': return 'font/ttf'
    case 'map': return 'application/json'
    default: return 'application/octet-stream'
  }
}

export default unlighthouseAstro
