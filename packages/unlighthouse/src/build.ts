import type { Logger, Storage } from '@unlighthouse/contracts'
import type {
  ClientOptionsPayload,
  GenerateClientOptions,
  ResolvedUserConfig,
  RuntimeSettings,
  ScanMeta,
} from './types'
import { dirname, join, resolve } from 'node:path'
import { buildStaticSnapshot } from '@unlighthouse/core/api/static-client'
import fs from 'fs-extra'
import { pick } from 'lodash-es'
import { withLeadingSlash, withTrailingSlash } from 'ufo'

export interface GenerateClientDeps {
  resolvedConfig: ResolvedUserConfig
  runtimeSettings: RuntimeSettings
  storage: Storage
  logger?: Logger
}

/**
 * Copies the file contents of the @unlighthouse/ui package and does
 * transformation based on the provided configuration. Reads scan/route data
 * from the v1 `Storage` port; the legacy `worker.reports()` in-memory cache
 * is gone.
 *
 * Static builds embed the per-route payload as JSON; the LHR blobs the UI
 * fetches on demand still come from `storage.blobs` via the runtime API.
 */
export async function generateClient(options: GenerateClientOptions = {}, deps: GenerateClientDeps) {
  const { runtimeSettings, resolvedConfig, storage, logger } = deps

  let prefix = withTrailingSlash(withLeadingSlash(resolvedConfig.routerPrefix))
  if (prefix === '/') {
    prefix = ''
  }
  const clientPathFolder = dirname(runtimeSettings.resolvedClientPath)

  logger?.debug(`Copying client from ${clientPathFolder} to ${runtimeSettings.generatedClientPath}`)
  await fs.copy(clientPathFolder, runtimeSettings.generatedClientPath)

  const inlineScript = `window.__unlighthouse_static = ${!!options.static}`
  let indexHTML = await fs.readFile(runtimeSettings.resolvedClientPath, 'utf-8')

  // Absolute (leading slash) so a hard-load / refresh on a deep client route
  // still finds the payload — a relative `assets/...` would resolve against the
  // current path and miss. The prefix-rewrite below adjusts it for sub-path hosting.
  const payloadScript = `<script src="/assets/payload.js"></script>`
  const inlineScriptTag = `<script data-unlighthouse-inline>${inlineScript}</script>`
  if (indexHTML.includes('</head>')) {
    indexHTML = indexHTML.replace('</head>', `${payloadScript}${inlineScriptTag}</head>`)
  }

  if (prefix) {
    indexHTML = indexHTML
      .replace(/(href|src)="\/assets\/(.*?)"/g, `$1="${prefix}assets/$2"`)
      .replace(/(href|src)="\/_nuxt\/(.*?)"/g, `$1="${prefix}_nuxt/$2"`)
      .replace(/(href|src)="\/_fonts\/(.*?)"/g, `$1="${prefix}_fonts/$2"`)
  }

  await fs.writeFile(resolve(runtimeSettings.generatedClientPath, 'index.html'), indexHTML, 'utf-8')

  // Resolve current scan via runtimeSettings; absent → empty payload.
  const scanId = runtimeSettings.currentScanId
  let routes: Awaited<ReturnType<Storage['routes']['listForScan']>>['items'] = []
  let scanMeta: ScanMeta = { favicon: undefined, routes: 0, score: 0 }

  if (scanId) {
    const list = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })
    routes = list.items
    const scoreValues = routes.map(r => r.scorePerformance).filter((s): s is number => s != null)
    const score = scoreValues.length ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0
    scanMeta = {
      favicon: undefined,
      routes: routes.length,
      score,
    }
  }

  // Full offline snapshot (#290): embed every scan's rows + contract blobs so the
  // static client serves the dashboard (incl. the homepage/all routes) with no API.
  let snapshot: Awaited<ReturnType<typeof buildStaticSnapshot>> | undefined
  if (options.static && scanId) {
    try {
      snapshot = await buildStaticSnapshot({
        storage,
        scanId: scanId as never,
        config: resolvedConfig as never,
      })
    }
    catch (err) {
      logger?.warn?.('Failed to build static snapshot; report will be data-less offline.', err)
    }
  }

  const staticData: { options: ClientOptionsPayload, scanMeta: ScanMeta, reports: unknown[], snapshot?: unknown, screenshots?: Record<string, string> } = {
    reports: options.static ? routes : [],
    scanMeta,
    snapshot,
    options: pick({
      ...runtimeSettings,
      ...resolvedConfig,
    }, [
      'client',
      'site',
      'websocketUrl',
      'lighthouseOptions',
      'scanner',
      'routerPrefix',
      'websocketUrl',
      'apiUrl',
    ]),
  }
  staticData.options.lighthouseOptions = { onlyCategories: resolvedConfig.lighthouseOptions.onlyCategories }

  const assetsDir = join(runtimeSettings.generatedClientPath, 'assets')
  await fs.ensureDir(assetsDir)

  // #275: export each route's screenshot to a static file so offline thumbnails
  // resolve without the `/dashboard/screenshot` API. One per path (device-agnostic,
  // matching the live endpoint). Prefers the dedicated screenshot blob, falls back
  // to the LHR's fullPageScreenshot.
  if (options.static && routes.length) {
    const { gunzipSync } = await import('node:zlib')
    const shotsDir = join(assetsDir, 'screenshots')
    await fs.ensureDir(shotsDir)
    const screenshots: Record<string, string> = {}
    let idx = 0
    for (const r of routes) {
      if (screenshots[r.path])
        continue
      let bytes: Uint8Array | undefined
      let ext = 'webp'
      if (r.screenshotBlobKey) {
        const blob = await storage.blobs.get(r.screenshotBlobKey)
        if (blob)
          bytes = blob
      }
      if (!bytes && r.lhrBlobKey) {
        const gz = await storage.blobs.get(r.lhrBlobKey)
        if (gz) {
          try {
            const lhr = JSON.parse(gunzipSync(gz).toString())
            const data: string | undefined = lhr.fullPageScreenshot?.screenshot?.data
            if (data) {
              bytes = Buffer.from(data.replace(/^data:image\/\w+;base64,/, ''), 'base64')
              ext = 'jpeg'
            }
          }
          catch {
            // unreadable LHR — skip this route's screenshot
          }
        }
      }
      if (!bytes)
        continue
      const file = `screenshots/${idx++}.${ext}`
      await fs.writeFile(join(assetsDir, file), bytes)
      // Absolute from the report root — these render on deep client-side routes,
      // so a relative URL would resolve against the current path and 404.
      // `prefix` is '' (root) or '/sub/'; `|| '/'` covers the root case.
      screenshots[r.path] = `${prefix || '/'}assets/${file}`
    }
    staticData.screenshots = screenshots
  }

  // Escape for safe embedding in a <script>: `<` (so a `</script>` inside any
  // LHR/contract HTML snippet can't close the tag) and U+2028/U+2029 (valid in
  // JSON but illegal in a JS string literal — they'd throw a SyntaxError and the
  // payload would silently never load, falling back to the dead live API).
  const payloadJson = JSON.stringify(staticData)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  await fs.writeFile(
    join(assetsDir, 'payload.js'),
    `window.__unlighthouse_payload = ${payloadJson}`,
    { encoding: 'utf-8' },
  )

  logger?.debug('Client generated successfully')
}
