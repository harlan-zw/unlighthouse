import type { Logger, Storage } from '@unlighthouse/contracts'
import type {
  ClientOptionsPayload,
  GenerateClientOptions,
  ResolvedUserConfig,
  RuntimeSettings,
  ScanMeta,
  StaticScreenshotMap,
} from './types'
import { Buffer } from 'node:buffer'
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseScanId } from '@unlighthouse/contracts'
import { UnlighthouseConfigSchema } from '@unlighthouse/contracts/config'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { buildStaticSnapshot } from '@unlighthouse/core/api/static-client'
import { decompressLhr } from '@unlighthouse/core/report'
import { withLeadingSlash, withTrailingSlash } from 'ufo'

export interface GenerateClientDeps {
  resolvedConfig: Pick<ResolvedUserConfig, 'client' | 'lighthouseOptions' | 'routerPrefix' | 'scanner' | 'site'>
  runtimeSettings: Pick<RuntimeSettings, 'apiUrl' | 'currentScanId' | 'generatedClientPath' | 'resolvedClientPath' | 'websocketUrl'>
  storage: Storage
  logger?: Logger
}

function pickKeys<K extends string>(source: object, keys: readonly K[]): Partial<Record<K, unknown>> {
  const picked: Partial<Record<K, unknown>> = {}
  for (const key of keys) {
    if (key in source)
      picked[key] = (source as Record<K, unknown>)[key]
  }
  return picked
}

async function findHtmlFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory())
      files.push(...await findHtmlFiles(path))
    else if (entry.isFile() && entry.name.endsWith('.html'))
      files.push(path)
  }
  return files
}

function injectRuntimeScripts(html: string, prefix: string, inlineScript: string): string {
  const payloadScript = `<script src="/assets/payload.js"></script>`
  const inlineScriptTag = `<script data-unlighthouse-inline>${inlineScript}</script>`

  if (html.includes('</head>') && !html.includes('data-unlighthouse-inline'))
    html = html.replace('</head>', `${payloadScript}${inlineScriptTag}</head>`)

  if (prefix) {
    html = html
      .replace(/(href|src)="\/assets\/(.*?)"/g, `$1="${prefix}assets/$2"`)
      .replace(/(href|src)="\/_nuxt\/(.*?)"/g, `$1="${prefix}_nuxt/$2"`)
      .replace(/(href|src)="\/_fonts\/(.*?)"/g, `$1="${prefix}_fonts/$2"`)
  }

  return html
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
  await cp(clientPathFolder, runtimeSettings.generatedClientPath, { recursive: true })

  const inlineScript = `window.__unlighthouse_static = ${!!options.static}`

  // Nuxt emits several browser entry points (`index.html`, `200.html`, and
  // prerendered route indexes). The live server prefers `200.html` for its SPA
  // fallback, while static hosts can serve a nested route index directly. Every
  // entry therefore needs the runtime payload and prefix rewrite; patching only
  // the root index leaves the dashboard on its build-time localhost defaults.
  const htmlFiles = await findHtmlFiles(runtimeSettings.generatedClientPath)
  await Promise.all(htmlFiles.map(async (path) => {
    const html = await readFile(path, 'utf-8')
    await writeFile(path, injectRuntimeScripts(html, prefix, inlineScript), 'utf-8')
  }))

  // Resolve current scan via runtimeSettings; absent → empty payload.
  const scanId = runtimeSettings.currentScanId
  const parsedScanId = scanId ? parseScanId(scanId) : null
  let routes: Awaited<ReturnType<Storage['routes']['listForScan']>>['items'] = []
  let scanMeta: ScanMeta = { favicon: undefined, routes: 0, score: 0 }

  if (parsedScanId) {
    const list = await storage.routes.listForScan(parsedScanId, { pageSize: 10_000 })
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
  if (options.static && parsedScanId) {
    try {
      snapshot = await buildStaticSnapshot({
        storage,
        scanId: parsedScanId,
        config: UnlighthouseConfigSchema.parse(resolvedConfig),
        logger,
      })
    }
    catch (err) {
      logOperationalWarn('host.static_snapshot_build_failed', err, { scanId: parsedScanId }, logger)
    }
  }

  const staticData: { options: ClientOptionsPayload, scanMeta: ScanMeta, reports: unknown[], snapshot?: unknown, screenshots?: StaticScreenshotMap } = {
    reports: options.static ? routes : [],
    scanMeta,
    snapshot,
    options: pickKeys({
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
    ]) as ClientOptionsPayload,
  }
  staticData.options.lighthouseOptions = { onlyCategories: resolvedConfig.lighthouseOptions.onlyCategories }

  const assetsDir = join(runtimeSettings.generatedClientPath, 'assets')
  await mkdir(assetsDir, { recursive: true })

  // #275: export each route/device screenshot to a static file so offline
  // thumbnails resolve without the `/dashboard/screenshot` API. Prefers the
  // dedicated screenshot blob, then falls back to the LHR's fullPageScreenshot.
  if (options.static && parsedScanId && routes.length) {
    const shotsDir = join(assetsDir, 'screenshots')
    await mkdir(shotsDir, { recursive: true })
    const scanScreenshots: StaticScreenshotMap[string] = {}
    const screenshots: StaticScreenshotMap = { [parsedScanId]: scanScreenshots }
    let idx = 0
    for (const r of routes) {
      const routeScreenshots = scanScreenshots[r.path] ??= {}
      if (routeScreenshots[r.device])
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
            const lhr = decompressLhr(gz)
            const data: string | undefined = lhr.fullPageScreenshot?.screenshot?.data
            if (data) {
              bytes = Buffer.from(data.replace(/^data:image\/\w+;base64,/, ''), 'base64')
              ext = 'jpeg'
            }
          }
          catch (err) {
            logOperationalWarn('host.static_screenshot_extract_failed', err, {
              scanId: parsedScanId,
              routePath: r.path,
              lhrBlobKey: r.lhrBlobKey,
            }, logger)
          }
        }
      }
      if (!bytes)
        continue
      const file = `screenshots/${idx++}.${ext}`
      await writeFile(join(assetsDir, file), bytes)
      // Absolute from the report root — these render on deep client-side routes,
      // so a relative URL would resolve against the current path and 404.
      // `prefix` is '' (root) or '/sub/'; `|| '/'` covers the root case.
      routeScreenshots[r.device] = `${prefix || '/'}assets/${file}`
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
  await writeFile(
    join(assetsDir, 'payload.js'),
    `window.__unlighthouse_payload = ${payloadJson}`,
    { encoding: 'utf-8' },
  )

  logger?.debug('Client generated successfully')
}
